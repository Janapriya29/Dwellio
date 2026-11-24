import React from 'react';
import { MessageData } from '@dwellio/shared';

interface ChatMessageItemProps {
  message: MessageData;
  isOwn: boolean;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({ message, isOwn }) => {
  const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex flex-col mb-3 ${isOwn ? 'items-end' : 'items-start'}`}>
      {!isOwn && (
        <span className="text-xs font-semibold text-slate-500 mb-1 ml-1">
          {message.sender.name}
          {message.sender.role === 'provider' && (
            <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-normal">
              Pro
            </span>
          )}
        </span>
      )}

      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm text-sm break-words whitespace-pre-wrap ${
          isOwn
            ? 'bg-blue-600 text-white rounded-br-xs'
            : 'bg-slate-100 text-slate-800 rounded-bl-xs'
        }`}
      >
        <p className="leading-relaxed">{message.content}</p>
        <div
          className={`flex items-center justify-end gap-1 text-[10px] mt-1 ${
            isOwn ? 'text-blue-100' : 'text-slate-400'
          }`}
        >
          <span>{formattedTime}</span>
          {isOwn && (
            <span title={message.readAt ? 'Read' : 'Delivered'}>
              {message.readAt ? (
                // Double check mark
                <svg
                  className="w-3.5 h-3.5 inline text-blue-200"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5M9.5 12.75l3 3 6.5-9" />
                </svg>
              ) : (
                // Single check mark
                <svg
                  className="w-3.5 h-3.5 inline text-blue-200/70"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
