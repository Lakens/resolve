# Branch Protection

GitHub branch protection is a repository setting, so it cannot be enforced from
source files alone. Configure it manually for `master` with these settings:

- Require a pull request before merging
- Require status checks to pass before merging
- Require branches to be up to date before merging

Recommended required checks:

- `Build Windows`
- `Build macOS`

If you also enable the tagged release workflow, keep release publishing limited
to tags such as `v1.0.1`.
