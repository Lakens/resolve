# Privacy Policy

Last updated: March 14, 2026

## Introduction

This Privacy Policy explains how QuartoReview collects, uses, and protects your information. QuartoReview is a desktop application that runs entirely on your own computer — it is not a web service or cloud platform. We are committed to your privacy, and by design, the app collects as little data as possible.

## Two modes of use

QuartoReview can be used in two ways, with different privacy implications:

### 1\. Local file mode (no account required)

When you open and edit local files from your computer without connecting to GitHub, **QuartoReview collects no data whatsoever.** Your files stay on your computer. Nothing is sent over the internet.

### 2\. GitHub mode (optional)

If you choose to connect GitHub to load and save files from your GitHub repositories, the following applies.

## What we collect in GitHub mode

### GitHub authentication

When you connect GitHub, you provide a GitHub Personal Access Token (PAT). This token is stored **only on your own computer**, in your local application data folder (`%APPDATA%\quartoreview\.env` on Windows). It is never sent to any QuartoReview server — because there is no QuartoReview server. The token is used exclusively to communicate directly between your computer and GitHub’s API.

### Repository and file content

When you load or save a file via GitHub, your computer communicates directly with GitHub. QuartoReview does not see, log, or store this content. It passes through the local backend (running on your own machine on port 3001) and goes directly to GitHub.

### Session data

A session cookie is used to keep you authenticated within the local app session. This cookie is stored only in your browser session and is cleared when you close the app. It never leaves your computer.

## What we do NOT collect

*   No usage analytics
    
*   No tracking or telemetry
    
*   No crash reports sent to external servers
    
*   No marketing or advertising data
    
*   No content of your documents
    
*   No server-side logs (there is no QuartoReview server)

## Third-party services

### GitHub

If you use GitHub mode, you are subject to GitHub’s Privacy Policy. QuartoReview only communicates with GitHub using your own credentials, on your behalf.

## Data storage and security

All data — your documents, your GitHub token, your session — is stored locally on your computer. You are in full control. Uninstalling the app and deleting `%APPDATA%\quartoreview` removes everything.

## Your rights

Because QuartoReview stores no data on any external server, there is no personal data held by the developers to access, correct, or delete. Your data is entirely your own, stored on your own devices.

## Changes to this policy

We may update this Privacy Policy from time to time. Changes will be reflected by an updated date at the top of this document in the GitHub repository.

## Contact

If you have questions about this Privacy Policy, please open an issue at github.com/Lakens/QuartoReview.
