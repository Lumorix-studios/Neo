// import { useErrorHandler } from "../src/errorContext";
import React, {useEffect, useRef} from 'react';
import {Terminal as XTerm} from'xterm';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import 'xterm/css/xterm.css';


interface InfoPanelProps {
    isOpen: boolean;
    onClose: () => void;
  }
export default function terminal({ isOpen, onClose} : InfoPanelProps) {
    // const { reportError } = useErrorHandler();
    // (!isOpen) return null;
    const terminalRef = useref<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    useEffect(()=>  {
        if (!terminalRef.current) return;
    })

    const term =  new Xterm({
        cursorBlink: true,
      fontFamily: 'Courier New, Courier, monospace',
      fontSize: 14,
      theme: {
        background: '#1e1e1e', // Dark mode background canvas matching VS Code
        foreground: '#ffffff',
      },
    });
    term.open(terminalRef.current);
    xtermRef.current = term;

    // 2. Capture user keyboard input and invoke the Rust command
    const dataListener = term.onData((data) => {
      invoke('write_to_pty', { data });
    });

    // 3. Listen to background stream updates coming from Rust
    let unlistenPty: () => void;
    
    listen<string>('pty-data', (event) => {
      term.write(event.payload);
    }).then((unsub) => {
      unlistenPty = unsub;
    });

    // Clean up connections on component destruction
    return () => {
      dataListener.dispose();
      term.dispose();
      if (unlistenPty) unlistenPty();
    };
  }, []);
    return(
        <div 
        ref={terminalRef} 
        style={{ 
          width: '100%', 
          height: '400px', 
          backgroundColor: '#1e1e1e',
          padding: '8px'
        }} 
      />
    );
}