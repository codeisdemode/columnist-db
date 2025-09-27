#!/usr/bin/env node

import { spawn } from 'child_process';
import { createInterface } from 'readline';

// Test the MCP server by sending a simple JSON-RPC message
async function testServer() {
  console.log('Testing MCP server...');

  const server = spawn('node', ['standalone-server.js'], {
    stdio: ['pipe', 'pipe', 'inherit']
  });

  // Send initialization request
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  };

  server.stdin.write(JSON.stringify(initRequest) + '\n');

  // Set up line reader for responses
  const rl = createInterface({
    input: server.stdout,
    crlfDelay: Infinity
  });

  rl.on('line', (line) => {
    try {
      const response = JSON.parse(line);
      console.log('Server response:', JSON.stringify(response, null, 2));

      if (response.id === 1) {
        // Send list tools request
        const toolsRequest = {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list'
        };
        server.stdin.write(JSON.stringify(toolsRequest) + '\n');
      }

      if (response.id === 2) {
        console.log('✓ MCP server is working correctly!');
        server.kill();
        process.exit(0);
      }
    } catch (error) {
      console.error('Error parsing response:', error);
    }
  });

  // Handle server exit
  server.on('exit', (code) => {
    console.log(`Server exited with code ${code}`);
  });

  // Timeout after 5 seconds
  setTimeout(() => {
    console.error('Test timeout');
    server.kill();
    process.exit(1);
  }, 5000);
}

testServer().catch(console.error);