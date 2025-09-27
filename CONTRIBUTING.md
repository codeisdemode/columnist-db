# Contributing to Columnist

Thank you for your interest in contributing to Columnist! This document provides guidelines for contributing to the project.

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/codeisdemode/db.git
   cd db
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Build the library**
   ```bash
   npm run build:lib
   ```

## Project Structure

```
columnist/
├── lib/                    # Core database library
│   ├── columnist.ts        # Main database implementation
│   ├── index.ts           # Library exports
│   └── schema-examples.ts  # Example schemas
├── hooks/                  # React hooks
│   ├── use-columnist.ts    # Database instance hook
│   ├── use-live-query.ts   # Reactive query hook
│   └── use-stats.ts        # Statistics hook
├── __tests__/              # Unit tests
│   ├── columnist.test.ts   # Core database tests
│   └── vector.test.ts      # Vector search tests
├── src/                    # Source files
│   ├── node-compat.ts      # Node.js compatibility
│   └── test-setup.ts       # Test environment setup
├── app/                    # Demo Next.js app
│   ├── test/              # Test page
│   └── devtools/          # Database inspector
└── components/            # UI components for demo
```

## Testing

1. **Unit Testing**
   ```bash
   npx jest
   # or run specific test files
   npx jest __tests__/vector.test.ts
   ```

2. **Manual Testing**
   ```bash
   npm run dev
   # Visit http://localhost:3000/test
   ```

3. **Type Checking**
   ```bash
   npm run typecheck
   ```

4. **Build Testing**
   ```bash
   npm run build:lib
   npm pack --dry-run
   ```

## Code Style

- Use TypeScript for all new code
- Follow existing code formatting
- Add JSDoc comments for public APIs
- Ensure no TypeScript errors

## Pull Request Process

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Follow the code style guidelines
   - Add tests if applicable
   - Update documentation

4. **Test your changes**
   ```bash
   npm run typecheck
   npm run build:lib
   ```

5. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

6. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

## Commit Message Convention

We use conventional commits:

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

## Areas for Contribution

### High Priority
- **Cross-Device Synchronization** - Multi-device sync with conflict resolution and offline support
- **Peer-to-Peer Sync** - Local network and WebRTC-based device-to-device synchronization
- **Context Sharing** - Application state and session transfer across devices
- **Sync Adapters** - Real-time synchronization with external databases
- **Performance** - Query optimization, compound indexes, and caching
- **Production Readiness** - Error handling, monitoring, and logging

### Medium Priority
- **CRDT Integration** - Conflict-free replicated data types for complex synchronization
- **Selective Sync** - Device-specific data partitioning and bandwidth optimization
- **Presence Awareness** - Real-time device status and network condition monitoring
- **Documentation** - Comprehensive API docs, tutorials, and examples
- **Testing** - Additional unit tests, integration tests, and E2E tests
- **Devtools** - Enhanced database inspector with query profiling
- **Migration Tools** - Schema evolution helpers and data migration utilities

### Recently Completed ✅
- **Cross-Device Synchronization Foundation** - Added device fingerprinting, capability detection, and device management system
- **Security Features** - Added security audit, encryption at rest, and authentication hooks
- **Vector Search Optimization** - Implemented IVF indexing, vector caching, and performance optimizations
- **Testing Infrastructure** - Comprehensive Jest test suite with fake-indexeddb
- **Node.js Compatibility** - Improved error messages and fallback mechanisms
- **Production Build System** - Complete TypeScript compilation with proper dist/ output
- **GitHub Repository Updates** - Added built distribution files and version tags
- **Full Test Suite** - All 54 tests passing successfully
- **Sync Adapter Test Coverage** - Comprehensive test suites for Firebase and Supabase sync adapters
- **TypeScript Error Resolution** - Fixed all compilation errors in app components and subscription service
- **Utility Function Testing** - Added test coverage for utils.ts functions
- **Enhanced Subscription Service** - Added getUserSubscriptionsByStripeId method for webhook integration

### Low Priority
- **Protocol Optimization** - Binary protocols, compression, and efficient data transfer
- **Battery-Aware Sync** - Power-efficient synchronization scheduling
- **Predictive Prefetching** - Smart data caching based on usage patterns
- **UI Improvements** - Better demo interface
- **Example Apps** - Real-world usage examples
- **Benchmarks** - Performance comparisons

## Questions or Issues?

- **Documentation**: Check the [README](README.md) first
- **Bugs**: Open an issue with reproduction steps
- **Features**: Open an issue to discuss before implementing
- **Questions**: Start a discussion in the repository

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
