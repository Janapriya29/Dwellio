import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MessageData, ConversationData } from '@dwellio/shared';
import { getBookingMessages, sendBookingMessage, markMessagesRead } from '../../services/chatService';
import { socketClientService } from '../../services/socketService';
import { ChatMessageItem } from './ChatMessageItem';
import { ChatInputComposer } from './ChatInputComposer';

interface BookingChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  token: string;
  currentUserId: string;
  bookingTitle?: string;
  counterpartName?: string;
  counterpartRole?: 'customer' | 'provider';
}

export const BookingChatDrawer: React.FC<BookingChatDrawerProps> = ({
  isOpen,
  onClose,
  bookingId,
  token,
  currentUserId,
  bookingTitle = 'Service Appointment',
  counterpartName = 'Professional',
  counterpartRole = 'provider',
}) => {
  const [conversation, setConversation] = useState<ConversationData | null>(null);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  // 1. Fetch initial message history
  const loadChatHistory = useCallback(async () => {
    if (!bookingId || !token) return;
    setIsLoading(true);
    setError(null);

    try {
      const data = await getBookingMessages(bookingId, token, { limit: 50 });
      setConversation(data.conversation);
      setMessages(data.messages);
      setHasMore(Boolean(data.pagination?.hasMore));
      setNextCursor(data.pagination?.nextCursor);
      // Mark as read immediately on viewing
      await markMessagesRead(bookingId, token).catch(() => {});
    } catch (err: any) {
      setError(err?.message || 'Failed to load conversation messages');
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollToBottom(false), 50);
    }
  }, [bookingId, token]);

  // Load earlier messages when requested
  const loadEarlierMessages = async () => {
    if (!bookingId || !token || !nextCursor || isLoadingEarlier) return;
    setIsLoadingEarlier(true);

    try {
      const data = await getBookingMessages(bookingId, token, { limit: 50, before: nextCursor });
      // Prepend earlier messages, filtering out any duplicates
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newEarlier = data.messages.filter((m) => !existingIds.has(m.id));
        return [...newEarlier, ...prev];
      });
      setHasMore(Boolean(data.pagination?.hasMore));
      setNextCursor(data.pagination?.nextCursor);
    } catch (err: any) {
      console.error('Failed to load earlier messages:', err);
    } finally {
      setIsLoadingEarlier(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadChatHistory();
    } else {
      setMessages([]);
      setConversation(null);
      setIsTyping(false);
    }
  }, [isOpen, loadChatHistory]);

  // 2. Real-time Socket.IO subscriptions
  useEffect(() => {
    if (!isOpen || !bookingId || !token) return;

    // Connect socket and join booking room
    socketClientService.connect(token);
    socketClientService.joinBooking(bookingId);

    // Message listener
    const unsubMessage = socketClientService.onNewMessage((newMsg: MessageData) => {
      if (newMsg.bookingId === bookingId) {
        setMessages((prev) => {
          // Deduplicate if already present
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        setTimeout(() => scrollToBottom(true), 50);

        // Mark incoming messages as read if drawer is currently open
        if (newMsg.sender.id !== currentUserId) {
          socketClientService.markRead(bookingId);
          markMessagesRead(bookingId, token).catch(() => {});
        }
      }
    });

    // Typing listener
    const unsubTyping = socketClientService.onUserTyping((data) => {
      if (data.bookingId === bookingId && data.userId !== currentUserId) {
        setIsTyping(true);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          setIsTyping(false);
        }, 3500);
      }
    });

    // Stopped typing listener
    const unsubStoppedTyping = socketClientService.onUserStoppedTyping((data) => {
      if (data.bookingId === bookingId && data.userId !== currentUserId) {
        setIsTyping(false);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      }
    });

    // Read receipt listener
    const unsubRead = socketClientService.onMessagesRead((data) => {
      if (data.bookingId === bookingId && data.readBy !== currentUserId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.sender.id === currentUserId && !msg.readAt
              ? { ...msg, readAt: data.readAt }
              : msg
          )
        );
      }
    });

    // Conversation locked listener
    const unsubLocked = socketClientService.onConversationLocked((data) => {
      if (data.bookingId === bookingId) {
        setConversation((prev) => (prev ? { ...prev, status: 'locked' } : null));
      }
    });

    return () => {
      unsubMessage();
      unsubTyping();
      unsubStoppedTyping();
      unsubRead();
      unsubLocked();
      socketClientService.leaveBooking(bookingId);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [isOpen, bookingId, token, currentUserId]);

  // Handle message submission
  const handleSendMessage = async (content: string) => {
    if (!content.trim() || conversation?.status === 'locked') return;

    try {
      // Send via socket first for immediate delivery, fallback to REST
      socketClientService.sendMessage(bookingId, content);
      socketClientService.stopTyping(bookingId);
      scrollToBottom(true);
    } catch {
      // Fallback to HTTP API
      try {
        const sentMsg = await sendBookingMessage(bookingId, content, token);
        setMessages((prev) => [...prev, sentMsg]);
        scrollToBottom(true);
      } catch (sendErr: any) {
        alert(sendErr?.message || 'Failed to send message');
      }
    }
  };

  const handleTyping = () => {
    socketClientService.startTyping(bookingId);
  };

  if (!isOpen) return null;

  const isLocked = conversation?.status === 'locked';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Panel */}
      <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-slate-200 bg-white flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
              {counterpartName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-800 text-sm leading-tight">
                  {counterpartName}
                </h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600 capitalize">
                  {counterpartRole}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate max-w-[200px] mt-0.5">
                {bookingTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isLocked && (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">
                Closed
              </span>
            )}
            <button
              onClick={onClose}
              aria-label="Close chat"
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Locked Conversation Warning Banner */}
        {isLocked && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <span>This conversation is closed because the booking is completed or cancelled.</span>
          </div>
        )}

        {/* Messages Body */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">Loading messages...</p>
            </div>
          ) : error ? (
            <div className="text-center p-6 bg-red-50 rounded-xl m-4">
              <p className="text-xs text-red-600 font-medium">{error}</p>
              <button
                onClick={loadChatHistory}
                className="mt-2 text-xs text-blue-600 underline font-medium"
              >
                Retry
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-600">No messages yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
                Say hello to coordinate appointment details or ask questions directly.
              </p>
            </div>
          ) : (
            <>
              {hasMore && (
                <div className="flex justify-center mb-3">
                  <button
                    onClick={loadEarlierMessages}
                    disabled={isLoadingEarlier}
                    className="text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1 rounded-full transition-colors disabled:opacity-50"
                  >
                    {isLoadingEarlier ? 'Loading...' : 'Load earlier messages'}
                  </button>
                </div>
              )}
              {messages.map((msg) => (
                <ChatMessageItem
                  key={msg.id}
                  message={msg}
                  isOwn={msg.sender.id === currentUserId}
                />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Typing indicator */}
        {isTyping && (
          <div className="px-4 py-1.5 bg-slate-50 text-xs text-slate-500 italic flex items-center gap-1.5 border-t border-slate-100">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span>{counterpartName} is typing...</span>
          </div>
        )}

        {/* Message Input Composer */}
        <ChatInputComposer
          onSendMessage={handleSendMessage}
          onTyping={handleTyping}
          disabled={isLocked}
          placeholder={`Message ${counterpartName}...`}
        />
      </div>
    </div>
  );
};
