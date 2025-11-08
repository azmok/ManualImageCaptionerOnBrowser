module.exports = {
  proxy: "localhost:3000",
  files: ["public/**/*.{html,js,css}"],
  watchOptions: {
    ignoreInitial: true,
    ignored: '*.txt'
  },
  port: 3001,
  open: false,
  notify: true,
  reloadDelay: 0
};
