module.exports = {
  testEnvironment: 'node',

  collectCoverage: typeof process.env.CI !== 'undefined',
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/test/'
  ]
}
