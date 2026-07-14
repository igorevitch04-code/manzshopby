export default {
  setItem: (key, value) => Promise.resolve(window.localStorage.setItem(key, value)),
  getItem: (key) => Promise.resolve(window.localStorage.getItem(key)),
  multiGet: (keys) => Promise.resolve(keys.map(key => [key, window.localStorage.getItem(key)])),
  removeItem: (key) => Promise.resolve(window.localStorage.removeItem(key)),
  clear: () => Promise.resolve(window.localStorage.clear())
};