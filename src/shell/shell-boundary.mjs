export function createShellBoundary({ navigate } = {}) {
  const navigateFn = typeof navigate === "function" ? navigate : page => page;
  return Object.freeze({
    navigate(page) {
      return navigateFn(page);
    }
  });
}
