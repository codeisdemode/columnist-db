import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DatabaseTest } from '@/components/DatabaseTest'
import { useResearchDB } from '@/hooks/useResearchDB'

// Mock the hook
vi.mock('@/hooks/useResearchDB', () => ({
  useResearchDB: vi.fn()
}))

describe('DatabaseTest Component', () => {
  const mockUseResearchDB = {
    isLoading: false,
    error: null,
    addPaper: vi.fn(),
    addNote: vi.fn(),
    searchPapers: vi.fn(),
    getAllPapers: vi.fn(),
    getAllNotes: vi.fn(),
    getNotesForPaper: vi.fn(),
    deletePaper: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useResearchDB as any).mockReturnValue(mockUseResearchDB)
  })

  it('should render the test component', () => {
    render(<DatabaseTest />)

    expect(screen.getByText('Database Test Suite')).toBeInTheDocument()
    expect(screen.getByText('Run Database Tests')).toBeInTheDocument()
    expect(screen.getByText('No tests run yet. Click the button above to run tests.')).toBeInTheDocument()
  })

  it('should run tests successfully', async () => {
    // Mock successful responses
    mockUseResearchDB.addPaper.mockResolvedValue({ id: 'paper-1' })
    mockUseResearchDB.addNote.mockResolvedValue({ id: 'note-1' })
    mockUseResearchDB.searchPapers.mockResolvedValue([{ id: 'paper-1', title: 'Test Paper' }])
    mockUseResearchDB.getAllPapers.mockResolvedValue([{ id: 'paper-1', title: 'Test Paper' }])
    mockUseResearchDB.getAllNotes.mockResolvedValue([{ id: 'note-1', content: 'Test note' }])

    render(<DatabaseTest />)

    const runButton = screen.getByText('Run Database Tests')
    fireEvent.click(runButton)

    // Wait for all tests to complete
    await waitFor(() => {
      expect(screen.getByText(/All tests completed successfully!/)).toBeInTheDocument()
    })

    // Verify all methods were called
    expect(mockUseResearchDB.addPaper).toHaveBeenCalledWith({
      title: 'Machine Learning in Healthcare',
      authors: 'John Smith, Jane Doe',
      abstract: 'This paper explores the application of machine learning algorithms in healthcare diagnostics and treatment planning.',
      publicationDate: expect.any(Date),
      tags: 'machine-learning, healthcare, ai'
    })

    expect(mockUseResearchDB.addNote).toHaveBeenCalledWith({
      content: 'Interesting findings about neural networks in medical imaging.',
      tags: ['neural-networks', 'medical-imaging']
    })

    expect(mockUseResearchDB.searchPapers).toHaveBeenCalledWith('machine learning')
    expect(mockUseResearchDB.getAllPapers).toHaveBeenCalled()
    expect(mockUseResearchDB.getAllNotes).toHaveBeenCalled()
  })

  it('should handle test failures', async () => {
    // Mock a failure
    mockUseResearchDB.addPaper.mockRejectedValue(new Error('Database error'))

    render(<DatabaseTest />)

    const runButton = screen.getByText('Run Database Tests')
    fireEvent.click(runButton)

    // Wait for error message
    await waitFor(() => {
      expect(screen.getByText(/✗ Test failed: Database error/)).toBeInTheDocument()
    })
  })

  it('should clear previous results when running new tests', async () => {
    mockUseResearchDB.addPaper.mockResolvedValue({ id: 'paper-1' })
    mockUseResearchDB.addNote.mockResolvedValue({ id: 'note-1' })
    mockUseResearchDB.searchPapers.mockResolvedValue([])
    mockUseResearchDB.getAllPapers.mockResolvedValue([])
    mockUseResearchDB.getAllNotes.mockResolvedValue([])

    render(<DatabaseTest />)

    // Run tests first time
    const runButton = screen.getByText('Run Database Tests')
    fireEvent.click(runButton)

    await waitFor(() => {
      expect(screen.getByText(/All tests completed successfully!/)).toBeInTheDocument()
    })

    // Run tests second time
    fireEvent.click(runButton)

    // Should only show one "All tests completed successfully!" message
    await waitFor(() => {
      const successMessages = screen.getAllByText(/All tests completed successfully!/)
      expect(successMessages).toHaveLength(1)
    })
  })

  it('should show loading state when database is initializing', () => {
    ;(useResearchDB as any).mockReturnValue({
      ...mockUseResearchDB,
      isLoading: true
    })

    render(<DatabaseTest />)

    // The component should still render normally even when loading
    expect(screen.getByText('Database Test Suite')).toBeInTheDocument()
    expect(screen.getByText('Run Database Tests')).toBeInTheDocument()
  })

  it('should handle database errors in initialization', () => {
    ;(useResearchDB as any).mockReturnValue({
      ...mockUseResearchDB,
      error: 'Database initialization failed'
    })

    render(<DatabaseTest />)

    // The component should still render normally even with errors
    expect(screen.getByText('Database Test Suite')).toBeInTheDocument()
    expect(screen.getByText('Run Database Tests')).toBeInTheDocument()
  })
})