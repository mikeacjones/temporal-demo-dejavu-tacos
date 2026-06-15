#!/usr/bin/env bash
#
# Build, push, and roll out the basic Déjà Vu Tacos stack.
#
# This deploys one frontend, one FastAPI backend, and one Python Temporal worker
# into temporal-dejavu-tacos at https://dejavu-tacos.tmprl-demo.cloud.

set -euo pipefail

REGION="${AWS_REGION:-us-west-1}"
ACCOUNT="${AWS_ACCOUNT_ID:-429214323166}"
NAMESPACE="${K8S_NAMESPACE:-temporal-dejavu-tacos}"
APP_REPO="${APP_ECR_REPOSITORY:-temporal-dejavu-tacos-app}"
FRONTEND_REPO="${FRONTEND_ECR_REPOSITORY:-temporal-dejavu-tacos-frontend}"
TEMPORAL_SECRET_NAME="${TEMPORAL_SECRET_NAME:-dejavu-tacos-secrets}"
SOURCE_SECRET_NAMESPACE="${SOURCE_TEMPORAL_SECRET_NAMESPACE:-money-transfer}"
SOURCE_SECRET_NAME="${SOURCE_TEMPORAL_SECRET_NAME:-money-transfer-secrets}"
TEMPORAL_CLOUD_NAMESPACE="${TEMPORAL_CLOUD_NAMESPACE:-${TEMPORAL_NAMESPACE:-temporal-demos-namespace.a2dd6}}"
TEMPORAL_ADDRESS_VALUE="${TEMPORAL_ADDRESS:-${TEMPORAL_ENDPOINT:-${TEMPORAL_CLOUD_NAMESPACE}.tmprl.cloud:7233}}"
TAG="${IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"
BUILD_IMAGES="${BUILD_IMAGES:-1}"

REGISTRY="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"
APP_IMAGE="${REGISTRY}/${APP_REPO}"
FRONTEND_IMAGE="${REGISTRY}/${FRONTEND_REPO}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "${ROOT}"

ensure_ecr_repo() {
  local repo="$1"
  if ! aws ecr describe-repositories --region "${REGION}" --repository-names "${repo}" >/dev/null 2>&1; then
    aws ecr create-repository --region "${REGION}" --repository-name "${repo}" >/dev/null
  fi
}

apply_configmap() {
  kubectl create configmap dejavu-tacos-config \
    --namespace "${NAMESPACE}" \
    --from-literal=DEJAVU_RELOAD=0 \
    --from-literal=DEJAVU_WORKER_LANGUAGE=python \
    --from-literal=DEJAVU_BACKEND_URL=http://backend:8000 \
    --from-literal=TEMPORAL_ADDRESS="${TEMPORAL_ADDRESS_VALUE}" \
    --from-literal=TEMPORAL_NAMESPACE="${TEMPORAL_CLOUD_NAMESPACE}" \
    --from-literal=TEMPORAL_TLS=true \
    --dry-run=client \
    --output yaml \
    | kubectl apply -f -
}

apply_temporal_secret() {
  if [[ -n "${TEMPORAL_API_KEY:-}" ]]; then
    kubectl create secret generic "${TEMPORAL_SECRET_NAME}" \
      --namespace "${NAMESPACE}" \
      --from-literal=TEMPORAL_API_KEY="${TEMPORAL_API_KEY}" \
      --dry-run=client \
      --output yaml \
      | kubectl apply -f -
    return
  fi

  local encoded_api_key
  encoded_api_key="$(
    kubectl get secret "${SOURCE_SECRET_NAME}" \
      --namespace "${SOURCE_SECRET_NAMESPACE}" \
      --output jsonpath='{.data.TEMPORAL_API_KEY}'
  )"
  if [[ -z "${encoded_api_key}" ]]; then
    echo "TEMPORAL_API_KEY not found in ${SOURCE_SECRET_NAMESPACE}/${SOURCE_SECRET_NAME}" >&2
    exit 1
  fi

  local secret_file
  secret_file="$(mktemp)"
  cat >"${secret_file}" <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ${TEMPORAL_SECRET_NAME}
  namespace: ${NAMESPACE}
type: Opaque
data:
  TEMPORAL_API_KEY: ${encoded_api_key}
EOF
  kubectl apply -f "${secret_file}"
  rm -f "${secret_file}"
}

if [[ "${BUILD_IMAGES}" == "1" ]]; then
  ensure_ecr_repo "${APP_REPO}"
  ensure_ecr_repo "${FRONTEND_REPO}"

  aws ecr get-login-password --region "${REGION}" \
    | docker login --username AWS --password-stdin "${REGISTRY}"

  docker buildx build --platform linux/amd64 \
    -f docker/backend.Dockerfile \
    -t "${APP_IMAGE}:${TAG}" \
    -t "${APP_IMAGE}:latest" \
    --push .

  docker buildx build --platform linux/amd64 \
    -f docker/frontend.Dockerfile \
    -t "${FRONTEND_IMAGE}:${TAG}" \
    -t "${FRONTEND_IMAGE}:latest" \
    --push .
fi

kubectl apply -f deploy/k8s/namespace.yaml
apply_temporal_secret
apply_configmap
kubectl apply -f deploy/k8s/service.yaml
kubectl apply -f deploy/k8s/certificate.yaml
kubectl apply -f deploy/k8s/deployment.yaml
kubectl apply -f deploy/k8s/ingressroute.yaml

kubectl set image deployment/dejavu-tacos-backend backend="${APP_IMAGE}:${TAG}" -n "${NAMESPACE}"
kubectl set image deployment/dejavu-tacos-worker-python worker="${APP_IMAGE}:${TAG}" -n "${NAMESPACE}"
kubectl set image deployment/dejavu-tacos-frontend frontend="${FRONTEND_IMAGE}:${TAG}" -n "${NAMESPACE}"

kubectl rollout status deployment/dejavu-tacos-backend -n "${NAMESPACE}" --timeout=300s
kubectl rollout status deployment/dejavu-tacos-worker-python -n "${NAMESPACE}" --timeout=300s
kubectl rollout status deployment/dejavu-tacos-frontend -n "${NAMESPACE}" --timeout=300s

echo "Deployed ${TAG}"
echo "https://dejavu-tacos.tmprl-demo.cloud"
echo "Temporal namespace: ${TEMPORAL_CLOUD_NAMESPACE}"
