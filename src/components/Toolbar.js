import React from 'react';
import './Toolbar.css';

function Toolbar({ onRefresh, onFetch, onPull, onPush, onStash, refreshing }) {
  return (
    <div className="toolbar">
      <button className="toolbar-button" onClick={onRefresh} disabled={!onRefresh || refreshing}>
        <span className={`toolbar-button-icon ${refreshing ? 'spinning' : ''}`}>↻</span>
        <span className="toolbar-button-label">Refresh</span>
      </button>
      <div className="toolbar-separator"></div>
      <button className="toolbar-button" onClick={onFetch} disabled={!onFetch}>
        <span className="toolbar-button-icon">⬇</span>
        <span className="toolbar-button-label">Fetch</span>
      </button>
      <button className="toolbar-button" onClick={onPull} disabled={!onPull}>
        <span className="toolbar-button-icon">⤓</span>
        <span className="toolbar-button-label">Pull</span>
      </button>
      <button className="toolbar-button" onClick={onPush} disabled={!onPush}>
        <span className="toolbar-button-icon">⬆</span>
        <span className="toolbar-button-label">Push</span>
      </button>
      <div className="toolbar-separator"></div>
      <button className="toolbar-button" onClick={onStash} disabled={!onStash}>
        <span className="toolbar-button-icon">📦</span>
        <span className="toolbar-button-label">Stash</span>
      </button>
    </div>
  );
}

export default Toolbar;
