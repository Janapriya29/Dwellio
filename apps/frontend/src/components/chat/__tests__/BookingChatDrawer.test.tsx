import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BookingChatDrawer } from '../BookingChatDrawer';
import * as chatService from '../../../services/chatService';
import { socketClientService } from '../../../services/socketService';
import { MessageData, ConversationData } from '@dwellio/shared';

vi.mock('../../../services/chatService', () => ({
  getBookingMessages: vi.fn(),
  sendBookingMessage: vi.fn(),
  markMessagesRead: vi.fn().mockResolvedValue(1),
  getUnreadChatCount: vi.fn().mockResolvedValue({ totalUnread: 0, byBooking: {} }),
}));

vi.mock('../../../services/socketService', () => ({
  socketClientService: {
    connect: vi.fn(),
    joinBooking: vi.fn(),
    leaveBooking: vi.fn(),
    sendMessage: vi.fn(),
    startTyping: vi.fn(),
    stopTyping: vi.fn(),
    markRead: vi.fn(),
    onNewMessage: vi.fn(() => vi.fn()),
    onUserTyping: vi.fn(() => vi.fn()),
    onUserStoppedTyping: vi.fn(() => vi.fn()),
    onMessagesRead: vi.fn(() => vi.fn()),
    onConversationLocked: vi.fn(() => vi.fn()),
    disconnect: vi.fn(),
  },
}));

describe('Milestone 5B: BookingChatDrawer Component Tests', () => {
  const mockBookingId = 'booking-test-123';
  const mockToken = 'mock-jwt-token';
  const mockUserId = 'user-customer-1';

  const mockConversation: ConversationData = {
    id: 'conv-123',
    bookingId: mockBookingId,
    customer: { id: mockUserId, name: 'Pooja Sharma', role: 'customer' },
    provider: { id: 'user-provider-2', name: 'Karthik Raja', role: 'provider' },
    status: 'active',
    unreadCountCustomer: 0,
    unreadCountProvider: 0,
    createdAt: '2026-11-23T10:00:00.000Z',
    updatedAt: '2026-11-23T10:05:00.000Z',
  };

  const mockMessages: MessageData[] = [
    {
      id: 'msg-1',
      conversationId: 'conv-123',
      bookingId: mockBookingId,
      sender: { id: mockUserId, name: 'Pooja Sharma', role: 'customer' },
      content: 'Hello Karthik, what time will you arrive?',
      readAt: '2026-11-23T10:02:00.000Z',
      createdAt: '2026-11-23T10:01:00.000Z',
    },
    {
      id: 'msg-2',
      conversationId: 'conv-123',
      bookingId: mockBookingId,
      sender: { id: 'user-provider-2', name: 'Karthik Raja', role: 'provider' },
      content: 'I will be there by 10:30 AM.',
      readAt: null,
      createdAt: '2026-11-23T10:03:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom scrollIntoView mock
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('renders drawer header, counterpart details, and loads message history', async () => {
    vi.mocked(chatService.getBookingMessages).mockResolvedValueOnce({
      conversation: mockConversation,
      messages: mockMessages,
    });

    render(
      <BookingChatDrawer
        isOpen={true}
        onClose={vi.fn()}
        bookingId={mockBookingId}
        token={mockToken}
        currentUserId={mockUserId}
        bookingTitle="Electrical Repair"
        counterpartName="Karthik Raja"
        counterpartRole="provider"
      />
    );

    // Initial loading indicator
    expect(screen.getByText('Loading messages...')).toBeInTheDocument();

    // Verify messages loaded
    await waitFor(() => {
      expect(screen.getByText('Hello Karthik, what time will you arrive?')).toBeInTheDocument();
      expect(screen.getByText('I will be there by 10:30 AM.')).toBeInTheDocument();
    });

    // Check header details
    expect(screen.getAllByText('Karthik Raja').length).toBeGreaterThan(0);
    expect(screen.getByText('Electrical Repair')).toBeInTheDocument();
    expect(screen.getByText('provider')).toBeInTheDocument();

    // Verify socket connection and room join
    expect(socketClientService.connect).toHaveBeenCalledWith(mockToken);
    expect(socketClientService.joinBooking).toHaveBeenCalledWith(mockBookingId);
  });

  it('sends message via socket when composer submit button is clicked', async () => {
    vi.mocked(chatService.getBookingMessages).mockResolvedValueOnce({
      conversation: mockConversation,
      messages: mockMessages,
    });

    render(
      <BookingChatDrawer
        isOpen={true}
        onClose={vi.fn()}
        bookingId={mockBookingId}
        token={mockToken}
        currentUserId={mockUserId}
        bookingTitle="Electrical Repair"
        counterpartName="Karthik Raja"
        counterpartRole="provider"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Hello Karthik, what time will you arrive?')).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText('Message Karthik Raja...');
    fireEvent.change(textarea, { target: { value: 'Great, see you then!' } });

    const sendBtn = screen.getByLabelText('Send message');
    expect(sendBtn).not.toBeDisabled();
    fireEvent.click(sendBtn);

    expect(socketClientService.sendMessage).toHaveBeenCalledWith(
      mockBookingId,
      'Great, see you then!'
    );
  });

  it('displays closed badge and disables composer when conversation is locked', async () => {
    vi.mocked(chatService.getBookingMessages).mockResolvedValueOnce({
      conversation: { ...mockConversation, status: 'locked' },
      messages: mockMessages,
    });

    render(
      <BookingChatDrawer
        isOpen={true}
        onClose={vi.fn()}
        bookingId={mockBookingId}
        token={mockToken}
        currentUserId={mockUserId}
        bookingTitle="Electrical Repair"
        counterpartName="Karthik Raja"
        counterpartRole="provider"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Closed')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/This conversation is closed because the booking is completed or cancelled/i)
    ).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText('Conversation is closed');
    expect(textarea).toBeDisabled();
  });

  it('triggers onClose when close button is clicked', async () => {
    const handleClose = vi.fn();
    vi.mocked(chatService.getBookingMessages).mockResolvedValueOnce({
      conversation: mockConversation,
      messages: [],
    });

    render(
      <BookingChatDrawer
        isOpen={true}
        onClose={handleClose}
        bookingId={mockBookingId}
        token={mockToken}
        currentUserId={mockUserId}
        bookingTitle="Electrical Repair"
        counterpartName="Karthik Raja"
        counterpartRole="provider"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('No messages yet')).toBeInTheDocument();
    });

    const closeBtn = screen.getByLabelText('Close chat');
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
