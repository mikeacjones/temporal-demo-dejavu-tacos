# The Workflow viewscreen example (reinvent-example/): the phone app beside the order's
# Workflow timeline, served under /_reinvent_example/ and talking to the shared backend.
FROM node:22-slim AS build

WORKDIR /app
COPY reinvent-example/package.json reinvent-example/package-lock.json ./
RUN npm ci
COPY reinvent-example/ .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html/_reinvent_example
COPY docker/reinvent-example.nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
