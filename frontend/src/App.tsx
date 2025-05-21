import { useState, useEffect } from 'react';
import { Routes, Route, Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import './App.css';

// Define the structure of a file object based on backend response
interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  thumbnailLink?: string;
  webContentLink?: string;
}

// Define the structure for the paginated response from backend
interface PaginatedFilesResponse {
  data: DriveFile[];
  nextPageToken: string;
}

// Define the structure for a folder object
interface DriveFolder {
  id: string;
  name: string;
  mimeType: string;
}

// --- HomePage Component ---
function HomePage() {
  const navigate = useNavigate();

  const { data: folders, isLoading, error } = useQuery<DriveFolder[], Error>({
    queryKey: ['folders'],
    queryFn: async () => {
      console.log('Fetching folders...');
      const response = await fetch('http://localhost:8080/api/folders');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      console.log('Folders fetched successfully.');
      return result.data || [];
    },
  });

  if (isLoading) {
    return <div className="page-container">Loading folders...</div>;
  }

  if (error) {
    return <div className="page-container">Error fetching folders: {error.message}</div>;
  }

  return (
    <div className="page-container">
      <h1>Luke Avenue</h1>
      {(folders || []).length === 0 ? (
        <p>No folders found in the root directory.</p>
      ) : (
        <ul className="folder-list">
          {(folders || []).map((folder) => (
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
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');
  const queryClient = useQueryClient();

  // Pagination states
  const [currentPageToken, setCurrentPageToken] = useState<string>('');
  const [previousPageTokens, setPreviousPageTokens] = useState<string[]>(['']); // Keep track of tokens for "previous" button
  const pageSize = 20; // Define page size

  // Helper function to determine file type
  const getFileType = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    return 'other';
  };

  const handleFileClick = (file: DriveFile) => {
    console.log('handleFileClick triggered for file:', file.name, 'ID:', file.id, 'MIME Type:', file.mimeType);
    if (getFileType(file.mimeType) === 'video') {
      setSelectedVideoId(file.id);
      console.log('setSelectedVideoId called with ID:', file.id);
    } else if (file.webViewLink) {
        window.open(file.webViewLink, '_blank', 'noopener,noreferrer');
    }
  };

  const closeSelectedVideo = () => {
    setSelectedVideoId(null);
  };

  // Fetch folder name using React Query (Moved here for better scope visibility)
  const { data: folderName, isLoading: isLoadingFolderName, error: folderNameError } = useQuery<string, Error>({
    queryKey: ['folderName', folderId],
    queryFn: async () => {
      if (!folderId) throw new Error('Folder ID is missing');
      const response = await fetch(`http://localhost:8080/api/folder-name/${folderId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      return result.name || 'Unknown Folder';
    },
    enabled: !!folderId,
  });

  // Fetch files using React Query
  const { data, isLoading: isLoadingFiles, error: filesError } = useQuery<PaginatedFilesResponse, Error>({
    queryKey: ['files', folderId, currentPageToken, pageSize, filter], // Add filter to queryKey
    queryFn: async () => {
      if (!folderId) throw new Error('Folder ID is missing');
      let url = `http://localhost:8080/api/files/${folderId}?pageSize=${pageSize}&pageToken=${currentPageToken}`;
      if (filter !== 'all') {
        url += `&filter=${filter}`; // Add filter parameter if not 'all'
      }
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      return result; // Expecting { data: [], nextPageToken: "" }
    },
    enabled: !!folderId,
    // staleTime: Infinity, // Removed to ensure data refetches on pageToken change
  });

  // Extract files and nextPageToken from the data
  const files = data?.data || [];
  const nextPageToken = data?.nextPageToken || '';

  const handleNextPage = () => {
    if (nextPageToken) {
      setPreviousPageTokens(prev => [...prev, currentPageToken]); // 古いページトークンを履歴に追加
      setCurrentPageToken(nextPageToken); // 現在のページトークンを更新
    }
  };

  const handlePreviousPage = () => {
    if (previousPageTokens.length > 0) { // 履歴がある場合
      const newPreviousTokens = [...previousPageTokens];
      const prevToken = newPreviousTokens.pop(); // 履歴から最後のトークン（現在のページの前のトークン）を取得
      setCurrentPageToken(prevToken || ''); // そのトークンを現在のページトークンに設定（空の場合は最初のページ）
      setPreviousPageTokens(newPreviousTokens); // 履歴を更新
    }
  };

  const hasNextPage = !!nextPageToken; // Check if there's a next page
  const hasPreviousPage = previousPageTokens.length > 1 || (previousPageTokens.length === 1 && currentPageToken !== ''); // Check if there's a previous page

  // WebSocket for real-time updates (Moved here, after data fetching hooks)
  useEffect(() => {
    if (!folderId) return;
    const ws = new WebSocket('ws://localhost:8080/ws');
    ws.onopen = () => console.log(`WebSocket connection established for folder context: ${folderId}`);
    ws.onmessage = (event) => {
      console.log('WebSocket message received on FolderPage:', event.data);
      // Invalidate queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['files', folderId] });
      queryClient.invalidateQueries({ queryKey: ['folderName', folderId] });
    };
    ws.onerror = (error) => console.error('WebSocket error on FolderPage:', error);
    ws.onclose = (event) => console.log(`WebSocket connection closed on FolderPage: Code=${event.code}, Reason='${event.reason}'`);
    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, "Component unmounting from FolderPage");
      }
    };
  }, [folderId, queryClient]); // Add queryClient to dependencies

  const renderMediaPreview = (file: DriveFile, isSelectedVideoPlayer = false) => {
    const commonLinkProps = { target: "_blank", rel: "noopener noreferrer" };
    const embedBaseUrl = "https://drive.google.com/file/d/";
    console.log(`renderMediaPreview: file.name=${file.name}, file.mimeType=${file.mimeType}, isSelectedVideoPlayer=${isSelectedVideoPlayer}`); // Debug log

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
        return <img src={file.webContentLink || file.thumbnailLink} alt={file.name} className="media-preview" loading="lazy" onError={(e) => (e.currentTarget.src = file.thumbnailLink || '')} onClick={() => handleFileClick(file)} />;
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

  if (isLoadingFiles || isLoadingFolderName) {
    return <div className="page-container">Loading files for folder: {folderName || folderId}...</div>;
  }

  if (filesError) {
    return <div className="page-container">Error fetching files for folder {folderId}: {filesError.message}</div>;
  }

  if (folderNameError) {
    return <div className="page-container">Error fetching folder name for folder {folderId}: {folderNameError.message}</div>;
  }

  // Filtered files based on the current filter state (now handled by backend)
  // This client-side filtering is no longer strictly necessary if backend filters,
  // but keeping it for robustness or if backend filter is not exhaustive.
  // However, for now, we assume backend handles filtering.
  const filteredFiles = files; // No client-side filtering needed if backend filters

  return (
    <div className="page-container">
      <h1>Files in: {folderName || folderId}</h1> {/* Use folderName if available, otherwise folderId */}
      <p className="breadcrumb-link"><Link to="/">↩ Back to Folders</Link></p>

      <div className="filter-buttons">
        <button onClick={() => setFilter('all')} className={filter === 'all' ? 'active' : ''}>すべて</button>
        <button onClick={() => setFilter('image')} className={filter === 'image' ? 'active' : ''}>写真 📷</button>
        <button onClick={() => setFilter('video')} className={filter === 'video' ? 'active' : ''}>動画 🎥</button>
      </div>

      {selectedVideoId && (
        <div className="selected-video-container">
          <button onClick={closeSelectedVideo} className="close-selected-video-button">×</button>
          {(() => {
            const selectedFile = (files || []).find(f => f.id === selectedVideoId);
            return selectedFile ? renderMediaPreview(selectedFile, true) : null;
          })()}
        </div>
      )}

      {filteredFiles.length === 0 ? (
        <p>このフォルダーにはファイルが見つかりませんでした。</p>
      ) : (
        <div className="file-grid">
          {filteredFiles.map((file) => (
            <div key={file.id} className="file-grid-item">
              {renderMediaPreview(file, false)}
              <p className="file-name-grid" title={file.name}>
                {file.name}
                {getFileType(file.mimeType) === 'image' && <span className="file-type-icon"> 📷</span>}
                {getFileType(file.mimeType) === 'video' && <span className="file-type-icon"> 🎥</span>}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      <div className="pagination-controls">
        <button onClick={handlePreviousPage} disabled={!hasPreviousPage}>前へ</button>
        <button onClick={handleNextPage} disabled={!hasNextPage}>次へ</button>
      </div>
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
