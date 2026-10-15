// Thin promise wrapper around window.pywebview.api.
const Api = (() => {
  const ready = new Promise((resolve) => {
    if (window.pywebview && window.pywebview.api) resolve();
    else window.addEventListener("pywebviewready", () => resolve(), { once: true });
  });

  class ApiError extends Error {}

  // Returns the raw {ok, data | error | needs_confirm, warnings} envelope.
  async function raw(name, ...args) {
    await ready;
    const fn = window.pywebview.api[name];
    if (!fn) throw new ApiError(`Unknown API method: ${name}`);
    return fn(...args);
  }

  // Returns data or throws ApiError with the server's message.
  async function call(name, ...args) {
    const res = await raw(name, ...args);
    if (!res || !res.ok) throw new ApiError((res && res.error) || "Request failed");
    return res.data;
  }

  return { ready, raw, call, ApiError };
})();
