// sequential number 107
module.exports = {
  "dryRun": false,
  "branches": [
    "main",
    { name: "development", channel: "dev", prerelease: "dev" },
  ],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    [
      "@semantic-release/changelog",
      {
        "changelogFile": "docs/CHANGELOG.md"
      }
    ],
    ["@semantic-release/npm", {
      "npmPublish": false,
      "pkgRoot": "packages/indexer/",
    }],
    // "@semantic-release/github",
    [
      "@semantic-release/git",
      {
        "assets": [
          "docs/CHANGELOG.md",
          "packages/indexer/package.json",
        ],
        "message": "ci(release): update changelogs for ${nextRelease.version} [skip release][skip ci]"
      }
    ],
    ["@semantic-release/exec", {
      "generateNotes": "git pull origin '+refs/notes/semantic-release:refs/notes/semantic-release'"
    }]
  ]
};
