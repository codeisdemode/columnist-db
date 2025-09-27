---
name: Bug report
about: Create a report to help us improve
title: ''
labels: bug
assignees: ''
---

**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Initialize database with '...'
2. Call method '....'
3. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Code Example**
```typescript
// Minimal code example that reproduces the issue
const db = await Columnist.init("test", { schema: ... })
await db.insert({ ... })
```

**Error Message**
```
Paste the full error message here
```

**Environment (please complete the following information):**
- OS: [e.g. Windows 11, macOS 14]
- Browser: [e.g. Chrome 120, Firefox 121]
- Package Version: [e.g. 1.0.0]
- React Version: [e.g. 18.2.0] (if using React hooks)

**Additional context**
Add any other context about the problem here.

**Database State**
- Estimated record count: [e.g. 1000 records]
- Tables affected: [e.g. messages, users]
- Database size: [e.g. 5MB]
