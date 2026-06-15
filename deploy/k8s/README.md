# Déjà Vu Tacos Kubernetes Deploy

Basic single-environment deploy for `temporal-dejavu-tacos`.

It runs:

- `dejavu-tacos-frontend` — static React build served by nginx.
- `dejavu-tacos-backend` — FastAPI API and in-memory demo state.
- `dejavu-tacos-worker-python` — Python Temporal worker on task queue `dejavu-tacos`.

The public URL is:

```text
https://dejavu-tacos.tmprl-demo.cloud
```

Deploy from the repo root:

```bash
./deploy/k8s/deploy.sh
```

The script builds/pushes two ECR images, creates the namespace, configures the
Temporal Cloud connection, applies the plain Kubernetes and Traefik manifests,
and waits for the three rollouts.

Provide a Temporal Cloud namespace at deploy time:

```bash
TEMPORAL_CLOUD_NAMESPACE=my-namespace.a2dd6 \
TEMPORAL_API_KEY=... \
./deploy/k8s/deploy.sh
```

For this demo:

```bash
TEMPORAL_CLOUD_NAMESPACE=demo-dejavu-tacos.a2dd6 \
TEMPORAL_ADDRESS=demo-dejavu-tacos.a2dd6.tmprl.cloud:7233 \
TEMPORAL_API_KEY=... \
./deploy/k8s/deploy.sh
```

If the Cloud endpoint does not follow `<namespace>.tmprl.cloud:7233`, also set:

```bash
TEMPORAL_ADDRESS=my-endpoint:7233 ./deploy/k8s/deploy.sh
```

If `TEMPORAL_API_KEY` is not provided, the script falls back to copying
`TEMPORAL_API_KEY` from `money-transfer/money-transfer-secrets`.
