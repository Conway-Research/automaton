
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBuiltinTools } from '../agent/tools.js';
import type { ToolContext } from '../types.js';

describe('read_file security', () => {
  const mockReadFile = vi.fn();
  const mockContext = {
    conway: {
      readFile: mockReadFile,
    },
    identity: {
      sandboxId: 'test-sandbox',
    },
    // partial mocks for other required props if needed by other tools, 
    // but read_file only uses conway.readFile
  } as unknown as ToolContext;

  const tools = createBuiltinTools('test-sandbox');
  const readFileTool = tools.find(t => t.name === 'read_file');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  if (!readFileTool) {
    throw new Error('read_file tool not found');
  }

  it('allows reading harmless files', async () => {
    mockReadFile.mockResolvedValue('file content');
    const result = await readFileTool.execute({ path: 'hello.txt' }, mockContext);
    expect(result).toBe('file content');
    expect(mockReadFile).toHaveBeenCalledWith('hello.txt');
  });

  it('blocks access to wallet.json', async () => {
    const result = await readFileTool.execute({ path: '/home/automaton/wallet.json' }, mockContext);
    expect(result).toContain('Blocked');
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('blocks access to .env', async () => {
    const result = await readFileTool.execute({ path: '.env' }, mockContext);
    expect(result).toContain('Blocked');
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('blocks access to SSH keys', async () => {
    const result = await readFileTool.execute({ path: '~/.ssh/id_rsa' }, mockContext);
    expect(result).toContain('Blocked');
    expect(mockReadFile).not.toHaveBeenCalled();
  });
  
  it('blocks access to state database', async () => {
    const result = await readFileTool.execute({ path: 'state.db' }, mockContext);
    expect(result).toContain('Blocked');
    expect(mockReadFile).not.toHaveBeenCalled();
  });
});
