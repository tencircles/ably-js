module.exports = {
  env: {
    es6: true,
    node: true,
    browser: true
  },
  plugins: [
    "security"
  ],
  extends: [
    "plugin:security/recommended"
  ],
  rules: {
    "no-undef": "error",
    // comma-dangle used for browser compatibility for browsers that don't support trailing commas
    "comma-dangle": ["error", "never"],
    "eol-last": "error",
    // security/detect-object-injection just gives a lot of false positives
    // see https://github.com/nodesecurity/eslint-plugin-security/issues/21
    "security/detect-object-injection": "off"
  },
  parserOptions: {
    sourceType: "module"
  }
}
