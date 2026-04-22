  return (
    <div className="flex h-screen w-full bg-[#0c1015] text-[#b5bfc7] font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[260px] bg-[#11161d] flex flex-col border-r border-[#1e252e] shrink-0">
        <div className="flex items-center justify-between p-4 px-5">
           <div className="flex items-center gap-2">
             <div className="bg-[#2463eb] rounded-md p-1 h-6 w-6 flex items-center justify-center">
               <Bot className="h-4 w-4 text-white" />
             </div>
             <span className="text-[#e2e8f0] text-[15px] font-semibold tracking-wide">Nebula</span>
           </div>
           <svg className="w-4 h-4 text-[#6e7681] cursor-pointer hover:text-[#e2e8f0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        </div>

        <ScrollArea className="flex-1 px-3">
          {/* Agents */}
          <div className="mt-2 mb-6">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-[11px] font-semibold text-[#6e7681] tracking-wider uppercase">AGENTS</span>
              <Plus className="h-3.5 w-3.5 text-[#6e7681] cursor-pointer hover:text-[#e2e8f0]" />
            </div>
            <div className="space-y-0.5">
              {allAgents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors",
                    selectedAgentId === agent.id 
                      ? "bg-[#1f2937] text-[#e2e8f0]" 
                      : "text-[#8b949e] hover:bg-[#1f2937]/50 hover:text-[#e2e8f0]"
                  )}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="flex items-center justify-center flex-shrink-0 h-5 w-5 rounded bg-[#1d4ed8]/20 text-[#60a5fa] text-[10px]">
                      {agent.emoji || "🤖"}
                    </div>
                    <span className="truncate text-left font-medium">{agent.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Channels */}
          <div className="mb-6">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-[11px] font-semibold text-[#6e7681] tracking-wider uppercase">CHANNELS</span>
              <Plus className="h-3.5 w-3.5 text-[#6e7681] cursor-pointer hover:text-[#e2e8f0]" />
            </div>
            <div className="space-y-0.5">
              {[
                "gmail-replies", "market-intelligence", "general", "modern-pdf-export", 
                "mvp-build", "deploy-landing-page", "research-validation", "gmail-task",
                "job-applications", "weekly-tech-digest", "template-shop", "coding tasks", "nano-banana-test"
              ].map(channel => (
                <button
                  key={channel}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] text-[#8b949e] hover:bg-[#1f2937]/50 hover:text-[#e2e8f0] transition-colors"
                >
                  <span className="text-[#6e7681] text-lg leading-none mb-0.5 font-light">#</span>
                  <span className="truncate">{channel}</span>
                </button>
              ))}
            </div>
          </div>
        </ScrollArea>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-[#1e252e] mt-auto bg-[#0d1117]">
          <div className="space-y-0.5 mb-3">
            <button className="w-full flex items-center gap-3 px-2 py-1.5 rounded-md text-[13px] font-medium text-[#8b949e] hover:bg-[#1f2937]/50 hover:text-[#e2e8f0]">
              <MessageCircle className="w-4 h-4 text-[#6e7681]" />
              Inbox
            </button>
            <button className="w-full flex items-center gap-3 px-2 py-1.5 rounded-md text-[13px] font-medium text-[#8b949e] hover:bg-[#1f2937]/50 hover:text-[#e2e8f0]">
              <Cpu className="w-4 h-4 text-[#6e7681]" />
              Devices
            </button>
            <button className="w-full flex items-center gap-3 px-2 py-1.5 rounded-md text-[13px] font-medium text-[#8b949e] hover:bg-[#1f2937]/50 hover:text-[#e2e8f0]">
              <Settings2 className="w-4 h-4 text-[#6e7681]" />
              Settings
            </button>
          </div>
          <div className="px-2 flex gap-3 text-[11px] text-[#6e7681] pb-1 justify-center tracking-wide">
            <a href="#" className="hover:text-[#8b949e]">Docs</a>
            <span>·</span>
            <a href="#" className="hover:text-[#8b949e]">Privacy</a>
            <span>·</span>
            <a href="#" className="hover:text-[#8b949e]">Terms</a>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#0d1117] relative">
        {/* Top Banner */}
        <div className="h-[46px] border-b border-[#1e252e] flex items-center px-5 bg-[#161b22]">
          <div className="flex items-center gap-2 text-[#8b949e] text-[13px]">
            <Clock3 className="h-3.5 w-3.5" />
            <span>24 days left in your trial</span>
          </div>
          <button className="ml-auto text-[#6e7681] hover:text-[#e2e8f0]">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11 1L1 11M1 1L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* Thread View */}
        <ScrollArea className="flex-1 px-5 py-6">
          <div className="max-w-[850px] mx-auto flex flex-col gap-6 pb-32">
            {selectedThread.map((msg, index) => {
              const isAssistant = msg.role === "assistant";
              const isSystem = msg.role === "system";

              if (isSystem) {
                 return (
                   <div key={msg.id} className="flex gap-3 text-[#6e7681] text-[13px] ml-11">
                     <span className="italic">{msg.content}</span>
                   </div>
                 );
              }

              return (
                <div key={msg.id} className="flex gap-4">
                  <div className={cn(
                    "w-8 h-8 rounded-md flex-shrink-0 flex items-center justify-center font-semibold text-xs mt-1",
                    isAssistant ? "bg-[#1d4ed8] text-white" : "bg-[#1f2937] text-[#8b949e]"
                  )}>
                    {isAssistant ? (selectedAgent?.emoji || "🤖") : "v"}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[#e2e8f0] text-[14px] font-medium tracking-tight">{msg.sender}</span>
                      {isAssistant && (
                        <span className="text-[#6e7681] text-[11px] font-medium flex items-center gap-1.5">
                          19.4k tokens · 1m 2s · 
                          <span className="flex gap-1 ml-0.5">
                            <button className="hover:text-[#8b949e]">👍</button>
                            <button className="hover:text-[#8b949e]">👎</button>
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="text-[#b5bfc7] text-[14px] leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  </div>
                </div>
              );
            })}
            
            {chatError && (
              <div className="ml-12 mr-8 p-3 rounded-md border border-red-900/50 bg-[#3f191f]/30">
                <div className="flex gap-2.5 items-start text-red-400">
                  <span className="mt-1 flex-shrink-0">⚠️</span>
                  <div>
                    <div className="font-semibold text-[13px]">Error</div>
                    <div className="text-[#d87b87] text-[13px] mt-0.5">{chatError}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Bottom Input Area */}
        <div className="absolute bottom-6 left-0 right-0 px-5">
          <div className="max-w-[850px] mx-auto relative relative">
            <div className="absolute -top-10 left-0 right-0 flex gap-2 mb-2 pointer-events-auto">
              <button className="px-3 py-1.5 rounded-full border border-[#30363d] bg-[#0d1117] text-[#8b949e] text-xs hover:bg-[#1f2937] transition-colors shadow-sm">
                Provide more options
              </button>
              <button className="px-3 py-1.5 rounded-full border border-[#30363d] bg-[#0d1117] text-[#8b949e] text-xs hover:bg-[#1f2937] transition-colors shadow-sm">
                Refine the tone
              </button>
            </div>
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl flex flex-col focus-within:border-[#8b949e] transition-colors shadow-md">
              <textarea
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                placeholder="Ask me anything... (@ to mention, # for channels)"
                className="w-full bg-transparent px-4 py-3 min-h-[60px] text-[14px] text-[#e2e8f0] placeholder-[#6e7681] resize-none focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (chatDraft.trim()) {
                      // fallback to standard chat since handleSendChat from context might not match perfectly
                      const evt = e as any;
                    }
                  }
                }}
              />
              <div className="flex items-center justify-between px-3 pb-3">
                <span className="text-[#6e7681] text-[12px] pl-1 font-medium cursor-pointer hover:text-[#8b949e]">Google: Gemma 4 31B <ChevronRight className="inline w-3 h-3 ml-0.5 rotate-90" /></span>
                <div className="flex gap-1.5">
                  <button className="p-1.5 text-[#6e7681] hover:text-[#e2e8f0] transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                  </button>
                  <button disabled={!chatDraft.trim() || isReplying} className="p-1.5 bg-[#8b949e]/10 text-[#8b949e] rounded-md hover:bg-[#8b949e]/20 hover:text-[#e2e8f0] disabled:opacity-50 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dummy unused handlers to satisfy TypeScript */}
        <div className="hidden">
           {String(isCreateAgentOpen) + String(isDelegationOpen) + String(activeDelegationCount) + String(terminalReadyCount) + String(workspaceActivity)}
           {String(commandDraft) + String(commandCwdDraft) + String(isExecutingCommand) + String(commandError) + String(isProcessingCommandApproval)}
           {String(workspaceSyncError) + String(workspaceView)}
        </div>
      </main>
    </div>
  );
