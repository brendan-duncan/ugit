import React, { useState, useEffect } from 'react';
import './UpdateNotification.css';

const { ipcRenderer } = window.require('electron');

interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
}

function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('');

  useEffect(() => {
    // Get current app version
    ipcRenderer.invoke('get-app-version').then((version: string) => {
      setCurrentVersion(version);
    });

    // Listen for update events
    const handleUpdateAvailable = (event: any, info: UpdateInfo) => {
      console.log('Update available:', info);
      setUpdateAvailable(true);
      setUpdateInfo(info);
      setShowNotification(true);
      setChecking(false);
    };

    const handleUpdateNotAvailable = (event: any, info: any) => {
      console.log('No updates available');
      setChecking(false);
      setError(null);
    };

    const handleUpdateError = (event: any, error: { message: string }) => {
      console.error('Update error:', error);
      setError(error.message);
      setChecking(false);
      setDownloading(false);
    };

    const handleDownloadProgress = (event: any, progress: DownloadProgress) => {
      console.log('Download progress:', progress);
      setDownloadProgress(progress);
    };

    const handleUpdateDownloaded = (event: any, info: UpdateInfo) => {
      console.log('Update downloaded:', info);
      setDownloading(false);
      setUpdateDownloaded(true);
      setShowNotification(true);
    };

    const handleUpdateStatus = (event: any, status: { status: string }) => {
      if (status.status === 'checking') {
        setChecking(true);
        setError(null);
      }
    };

    const handleCheckForUpdatesManual = () => {
      setChecking(true);
      setError(null);
      setShowNotification(true);
      ipcRenderer.invoke('check-for-updates').then((result: any) => {
        if (!result.success) {
          setError(result.error);
          setChecking(false);
        }
      });
    };

    ipcRenderer.on('update-available', handleUpdateAvailable);
    ipcRenderer.on('update-not-available', handleUpdateNotAvailable);
    ipcRenderer.on('update-error', handleUpdateError);
    ipcRenderer.on('update-download-progress', handleDownloadProgress);
    ipcRenderer.on('update-downloaded', handleUpdateDownloaded);
    ipcRenderer.on('update-status', handleUpdateStatus);
    ipcRenderer.on('check-for-updates-manual', handleCheckForUpdatesManual);

    return () => {
      ipcRenderer.removeListener('update-available', handleUpdateAvailable);
      ipcRenderer.removeListener('update-not-available', handleUpdateNotAvailable);
      ipcRenderer.removeListener('update-error', handleUpdateError);
      ipcRenderer.removeListener('update-download-progress', handleDownloadProgress);
      ipcRenderer.removeListener('update-downloaded', handleUpdateDownloaded);
      ipcRenderer.removeListener('update-status', handleUpdateStatus);
      ipcRenderer.removeListener('check-for-updates-manual', handleCheckForUpdatesManual);
    };
  }, []);

  const handleDownload = () => {
    setDownloading(true);
    setError(null);
    ipcRenderer.invoke('download-update').then((result: any) => {
      if (!result.success) {
        setError(result.error);
        setDownloading(false);
      }
    });
  };

  const handleInstall = () => {
    ipcRenderer.invoke('install-update');
  };

  const handleDismiss = () => {
    setShowNotification(false);
    setUpdateAvailable(false);
    setUpdateDownloaded(false);
    setChecking(false);
    setError(null);
  };

  if (!showNotification) {
    return null;
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="update-notification">
      <div className="update-notification-content">
        <div className="update-notification-header">
          <h3>Software Update</h3>
          <button className="update-notification-close" onClick={handleDismiss}>×</button>
        </div>

        {checking && (
          <div className="update-notification-body">
            <p>Checking for updates...</p>
          </div>
        )}

        {error && (
          <div className="update-notification-body">
            <p className="update-error">Error: {error}</p>
            <div className="update-notification-actions">
              <button onClick={handleDismiss}>Close</button>
            </div>
          </div>
        )}

        {updateAvailable && !downloading && !updateDownloaded && (
          <div className="update-notification-body">
            <p>
              A new version <strong>{updateInfo?.version}</strong> is available!
            </p>
            <p className="update-current-version">Current version: {currentVersion}</p>
            {updateInfo?.releaseNotes && (
              <div className="update-release-notes">
                <p className="update-release-notes-label">Release notes:</p>
                <div className="update-release-notes-content">
                  {updateInfo.releaseNotes}
                </div>
              </div>
            )}
            <div className="update-notification-actions">
              <button className="update-button-primary" onClick={handleDownload}>
                Download Update
              </button>
              <button onClick={handleDismiss}>Later</button>
            </div>
          </div>
        )}

        {downloading && (
          <div className="update-notification-body">
            <p>Downloading update...</p>
            {downloadProgress && (
              <div className="update-progress">
                <div className="update-progress-bar">
                  <div
                    className="update-progress-bar-fill"
                    style={{ width: `${downloadProgress.percent}%` }}
                  />
                </div>
                <p className="update-progress-text">
                  {downloadProgress.percent.toFixed(1)}% ({formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)})
                </p>
              </div>
            )}
          </div>
        )}

        {updateDownloaded && (
          <div className="update-notification-body">
            <p>Update downloaded successfully!</p>
            <p>The update will be installed when you restart the application.</p>
            <div className="update-notification-actions">
              <button className="update-button-primary" onClick={handleInstall}>
                Restart and Install
              </button>
              <button onClick={handleDismiss}>Later</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default UpdateNotification;
