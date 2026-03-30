export function ChatIntro() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-semibold text-lg md:text-2xl">Chat</h1>
      <p className="hidden text-muted-foreground text-sm sm:block">
        Open this app in multiple browser windows to see the real-time database
        in action
      </p>
    </div>
  );
}
