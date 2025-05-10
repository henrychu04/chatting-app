import React, { useRef, useEffect } from 'react';

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  autoScroll?: boolean;
}

export const ScrollArea: React.FC<ScrollAreaProps> = ({ className = '', children, autoScroll = true, ...props }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [children, autoScroll]);

  return (
    <div
      ref={scrollRef}
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: '#2d2d2d #18181b',
      }}
      className={`overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-[#18181b] [&::-webkit-scrollbar-thumb]:bg-[#2d2d2d] [&::-webkit-scrollbar-thumb:hover]:bg-[#3d3d3d] [&::-webkit-scrollbar-thumb:active]:bg-[#3d3d3d] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
