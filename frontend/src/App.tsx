import { useState, useEffect } from 'react';
import { Routes, Route, Link, useParams, useNavigate } from 'react-router-dom'; // Import useNavigate
import './App.css';

// Define the structure of a file object based on backend response
interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  thumbnailLink?: string;
  webContentLink?: string; // Added for direct media access
}

// Define the structure for a folder object
interface DriveFolder {
  id: string;
  name: string;
  mimeType: string;
}

// --- HomePage Component ---
function HomePage() {
  const navigate = useNavigate(); // Initialize useNavigate
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchFolders = async () => {
      console.log('Fetching folders...');
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('http://localhost:8080/api/folders');
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        setFolders(result.data || []);
        console.log('Folders fetched successfully.');
      } catch (e) {
        if (e instanceof Error) {
          setError(e.message);
        } else {
          setError('An unknown error occurred while fetching folders');
        }
        console.error("Failed to fetch folders:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchFolders();
  }, []);

  if (loading) {
    return <div className="page-container">Loading folders...</div>;
  }

  if (error) {
    return <div className="page-container">Error fetching folders: {error}</div>;
  }

  return (
    <div className="page-container">
      <h1>Google Drive Folders</h1>
      {folders.length === 0 ? (
        <p>No folders found in the root directory.</p>
      ) : (
        <ul className="folder-list">
          {folders.map((folder) => (
            <li key={folder.id} className="folder-item" 
                onClick={() => {
                  console.log(`Item clicked for folder: ${folder.name}, ID: ${folder.id}`);
                  navigate(`/folder/${folder.id}`);
                }}
                style={{ cursor: 'pointer' }} // Add pointer cursor to indicate clickable
            >
              {/* Removed Link component, li itself is now the clickable trigger */}
              📁 {folder.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- FolderPage Component ---
function FolderPage() {
  const { folderId } = useParams<{ folderId: string }>();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const handleFileClick = (file: DriveFile) => {
    console.log('handleFileClick triggered for file:', file.name, 'ID:', file.id, 'MIME Type:', file.mimeType);
    if (file.mimeType.startsWith('video/')) {
      setSelectedVideoId(file.id);
      console.log('setSelectedVideoId called with ID:', file.id);
    } else if (file.webViewLink) {
        window.open(file.webViewLink, '_blank', 'noopener,noreferrer');
    }
  };

  const closeSelectedVideo = () => {
    setSelectedVideoId(null);
  };

  const fetchFiles = async () => {
    if (!folderId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`http://localhost:8080/api/files/${folderId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      setFiles(result.data || []);
    } catch (e) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError('An unknown error occurred while fetching files');
      }
      console.error(`Failed to fetch files for folder ${folderId}:`, e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
    const ws = new WebSocket('ws://localhost:8080/ws');
    ws.onopen = () => console.log(`WebSocket connection established for folder context: ${folderId}`);
    ws.onmessage = (event) => {
      console.log('WebSocket message received on FolderPage:', event.data);
      fetchFiles();
    };
    ws.onerror = (error) => console.error('WebSocket error on FolderPage:', error);
    ws.onclose = (event) => console.log(`WebSocket connection closed on FolderPage: Code=${event.code}, Reason='${event.reason}'`);
    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, "Component unmounting from FolderPage");
      }
    };
  }, [folderId]);

  const renderMediaPreview = (file: DriveFile, isSelectedVideoPlayer = false) => {
    const commonLinkProps = { target: "_blank", rel: "noopener noreferrer" };
    const embedBaseUrl = "https://drive.google.com/file/d/";

    if (isSelectedVideoPlayer) { // Logic for the large selected video player
      if (!file.mimeType.startsWith('video/') && !file.mimeType.startsWith('audio/')) {
        return null; // Only show video/audio in the large player
      }
      const embedUrl = `${embedBaseUrl}${file.id}/preview`;
      return (
        <iframe
          src={embedUrl}
          className="selected-video-iframe" // Specific class for large player iframe
          allow="autoplay; encrypted-media"
          allowFullScreen
          title={file.name}
          style={{ border: 'none', width: '100%', height: '100%' }}
        ></iframe>
      );
    } else { // Logic for grid items
      if (file.mimeType.startsWith('image/')) {
        return <img src={file.webContentLink || file.thumbnailLink} alt={file.name} className="media-preview" onError={(e) => (e.currentTarget.src = file.thumbnailLink || '')} onClick={() => handleFileClick(file)} />;
      } else if (file.mimeType.startsWith('video/') || file.mimeType.startsWith('audio/')) {
        const embedUrl = `${embedBaseUrl}${file.id}/preview`;
        return (
          <div style={{ position: 'relative', width: '100%', height: '150px' }}> {/* Grid item height for wrapper */}
            <iframe
              src={embedUrl}
              className="media-preview" // General class for grid iframe
              allowFullScreen // No autoplay for grid previews
              title={file.name}
              style={{ border: 'none', width: '100%', height: '100%' }}
            ></iframe>
            <div className="media-overlay" onClick={() => handleFileClick(file)}></div>
          </div>
        );
      } else { // Fallback for other file types in grid
        return (
          <div className="media-preview-placeholder" onClick={() => handleFileClick(file)}>
            <span role="img" aria-label="file icon" style={{fontSize: "2em"}}>📄</span>
            <p className="file-name-placeholder">{file.name}</p>
            <p className="file-type-placeholder"><small>{file.mimeType}</small></p>
            {file.webViewLink && <a href={file.webViewLink} {...commonLinkProps} onClick={(e) => { e.stopPropagation(); window.open(file.webViewLink!, '_blank', 'noopener,noreferrer'); }}>View on Drive</a>}
          </div>
        );
      }
    }
  };

  if (loading) {
    return <div className="page-container">Loading files for folder: {folderId}...</div>;
  }

  if (error) {
    return <div className="page-container">Error fetching files for folder {folderId}: {error}</div>;
  }

  return (
    <div className="page-container">
      <h1>Files in: {folderId}</h1>
      <p className="breadcrumb-link"><Link to="/">↩ Back to Folders</Link></p>

      {selectedVideoId && (
        <div className="selected-video-container">
          <button onClick={closeSelectedVideo} className="close-selected-video-button">×</button>
          {(() => {
            const selectedFile = files.find(f => f.id === selectedVideoId);
            return selectedFile ? renderMediaPreview(selectedFile, true) : null;
          })()}
        </div>
      )}

      {files.length === 0 ? (
        <p>No files found in this folder.</p>
      ) : (
        <div className="file-grid">
          {files.map((file) => (
            <div key={file.id} className="file-grid-item">
              {renderMediaPreview(file, false)} {/* Pass false for isSelectedVideoPlayer here */}
              <p className="file-name-grid" title={file.name}>
                {file.name}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Main App Component (Router Setup) ---
function App() {
  return (
    <>
      {/* A global header could go here, e.g., <header>My Drive Gallery</header> */}
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/folder/:folderId" element={<FolderPage />} />
        </Routes>
      </main>
      {/* A global footer could go here */}
    </>
  );
}

export default App;
