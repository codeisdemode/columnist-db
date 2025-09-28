## 📁 Project Structure

```
columnist-db/
├── lib/                   # Core database implementation
│   ├── columnist.ts      # Main database engine (80KB)
│   ├── sync/             # Synchronization adapters
│   └── utils.ts          # Utility functions
├── packages/             # Modular packages
│   ├── core/             # Core database package
│   ├── hooks/            # React hooks integration
│   ├── plugins/          # Sync and embedding plugins
│   └── tables/           # Pre-built table schemas
├── src/                  # Research Assistant demo app
│   ├── app/              # Next.js app router pages
│   ├── components/       # UI components
│   ├── hooks/            # Custom React hooks
│   └── lib/              # Application utilities
├── mcp-server/           # MCP server for AI integration
│   ├── standalone-server.js
│   ├── package.json
│   └── configuration files
├── .github/              # CI/CD workflows and issue templates
├── public/               # Static assets
└── configuration files   # Build and development configs
```

### UI Framework

The Research Assistant demo uses **Tailwind CSS** for styling with basic HTML components. While the project includes a `components.json` configuration for potential shadcn/ui integration, no shadcn/ui components are currently installed or used.

**To enhance the UI with shadcn/ui components:**
```bash
# Install shadcn/ui (optional)
npx shadcn@latest init
npx shadcn@latest add button card input
```
