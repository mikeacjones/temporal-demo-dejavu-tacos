// This app is served under a path prefix (/_reinvent_example/ on the demo host) and
// reaches the shared backend through its own nginx at <prefix>api/, so it works
// whatever else the host routes.
const API_ROOT = `${import.meta.env.BASE_URL}api`

export function api(path: string): string {
  return API_ROOT + path
}

export function isApi(url: string): boolean {
  return url.startsWith(API_ROOT + '/')
}
