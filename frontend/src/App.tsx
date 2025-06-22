import { useState, useEffect } from 'react';
import { Routes, Route, Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import './App.css';

// Define the structure of a file object based on backend response (Firebase Storage + Firestore)
interface FileMetadata {
  id: string; // Firestore document ID, same as Storage path
  name: string;
  mimeType: string;
  storagePath: string; // Path in Firebase Storage
  downloadUrl: string; // Public download URL
  folderId: string; // Corresponds to a logical folder
  hash: string; // SHA256 hash for deduplication
  createdAt: string; // ISO string for time.Time
}

// Define the structure for the paginated response from backend
interface PaginatedFilesResponse {
  data: FileMetadata[];
  nextPageToken: string;
}

// Define the structure for a folder object (from Firestore)
interface FolderMetadata {
  id: string;
  name: string;
  createdAt: string; // ISO string for time.Time
}

// --- HomePage Component ---
function HomePage() {
  const navigate = useNavigate();

  const { data: folders, isLoading, error } = useQuery<FolderMetadata[], Error>({
    queryKey: ['folders'],
    queryFn: async () => {
      console.log('Fetching folders...');
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/folders`);
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
      <p className="profile-link-container">
        <button onClick={() => navigate('/profiles')} className="profile-link-button">メンバープロフィールを見る</button>
      </p>
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
                style={{ cursor: 'pointer' }}
            >
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
  const params = useParams(); // params will now contain a key like '*'
  const folderId = params['*']; // Get the full path after /folder/
  console.log('FolderPage: folderId from params:', folderId); // Add this log
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null); // Store URL directly
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null); // Store URL for selected image
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');
  const queryClient = useQueryClient();

  // Pagination states
  const [currentPageToken, setCurrentPageToken] = useState<string>('');
  const [previousPageTokens, setPreviousPageTokens] = useState<string[]>(['']);
  const [currentPageNumber, setCurrentPageNumber] = useState<number>(1);
  const [pageTokenMap, setPageTokenMap] = useState<Map<number, string>>(new Map([[1, '']]));
  const [estimatedTotalPages, setEstimatedTotalPages] = useState<number>(5); // Show 5 pages initially
  const [isNavigating, setIsNavigating] = useState<boolean>(false);
  const pageSize = 20;

  // Helper function to determine file type
  const getFileType = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    return 'other';
  };

  const handleFileClick = (file: FileMetadata) => {
    console.log('handleFileClick triggered for file:', file.name, 'ID:', file.id, 'MIME Type:', file.mimeType);
    if (getFileType(file.mimeType) === 'video') {
      setSelectedVideoUrl(file.downloadUrl); // Set video URL for player
      console.log('setSelectedVideoUrl called with URL:', file.downloadUrl);
    } else if (getFileType(file.mimeType) === 'image') { // Handle image click for modal
      setSelectedImageUrl(file.downloadUrl);
      console.log('setSelectedImageUrl called with URL:', file.downloadUrl);
    }
    // Removed window.open for images and other files
  };

  const closeSelectedVideo = () => {
    setSelectedVideoUrl(null);
  };

  const closeSelectedImage = () => {
    setSelectedImageUrl(null);
  };

  // Fetch folder name using React Query
  const { data: folderName, isLoading: isLoadingFolderName, error: folderNameError } = useQuery<string, Error>({
    queryKey: ['folderName', folderId],
    queryFn: async () => {
      if (!folderId) throw new Error('Folder ID is missing');
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/folder-name/${folderId}`);
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
    queryKey: ['files', folderId, currentPageToken, pageSize, filter],
    queryFn: async () => {
      if (!folderId) throw new Error('Folder ID is missing');
      let url = `${import.meta.env.VITE_API_BASE_URL}/api/files/${folderId}?pageSize=${pageSize}&pageToken=${currentPageToken}`;
      if (filter !== 'all') {
        url += `&filter=${filter}`;
      }
      console.log('Fetching files from URL:', url); // Log the URL
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      console.log('Files fetched successfully. Data:', result); // Log the fetched data
      return result;
    },
    enabled: !!folderId,
  });

  // Extract files and nextPageToken from the data
  const files = data?.data || [];
  const nextPageToken = data?.nextPageToken || '';
  
  // Estimate total pages based on current page and whether there's a next page
  const currentEstimatedPages = Math.max(
    estimatedTotalPages,
    currentPageNumber + (nextPageToken ? 1 : 0)
  );

  const handleNextPage = () => {
    if (nextPageToken) {
      const nextPageNum = currentPageNumber + 1;
      setPreviousPageTokens((prev: string[]) => [...prev, currentPageToken]);
      setCurrentPageToken(nextPageToken);
      setCurrentPageNumber(nextPageNum);
      
      // Update page token map
      setPageTokenMap(prev => new Map(prev).set(nextPageNum, nextPageToken));
      
      // Update estimated total pages if we go beyond current known pages
      if (nextPageNum > estimatedTotalPages) {
        setEstimatedTotalPages(nextPageNum + 2); // Add buffer for more pages
      }
    }
  };

  const handlePreviousPage = () => {
    if (previousPageTokens.length > 0) {
      const newPreviousTokens = [...previousPageTokens];
      const prevToken = newPreviousTokens.pop();
      setCurrentPageToken(prevToken || '');
      setPreviousPageTokens(newPreviousTokens);
      setCurrentPageNumber(currentPageNumber - 1);
    }
  };

  const handlePageClick = async (pageNumber: number) => {
    if (pageNumber === currentPageNumber || isNavigating) return;
    
    const token = pageTokenMap.get(pageNumber);
    if (token !== undefined) {
      // We have the token for this page, navigate directly
      setCurrentPageToken(token);
      setCurrentPageNumber(pageNumber);
      
      // Rebuild previousPageTokens based on the target page
      const newPreviousTokens: string[] = [''];
      for (let i = 2; i <= pageNumber; i++) {
        const pageToken = pageTokenMap.get(i);
        if (pageToken !== undefined) {
          newPreviousTokens.push(pageTokenMap.get(i - 1) || '');
        }
      }
      setPreviousPageTokens(newPreviousTokens);
    } else {
      // We don't have the token, need to navigate sequentially to build the token map
      setIsNavigating(true);
      try {
        if (pageNumber > currentPageNumber) {
          // Navigate forward to build token map until we reach the target page
          await navigateForwardTo(pageNumber);
        } else {
          // Navigate backward (already have these tokens)
          navigateBackwardTo(pageNumber);
        }
      } finally {
        setIsNavigating(false);
      }
    }
  };

  const navigateForwardTo = async (targetPage: number) => {
    let currentPage = currentPageNumber;
    let currentToken = currentPageToken;
    const previousTokens = [...previousPageTokens];
    const tokenMap = new Map(pageTokenMap);
    
    while (currentPage < targetPage) {
      // Fetch next page to get the token
      if (!folderId) return;
      let url = `${import.meta.env.VITE_API_BASE_URL}/api/files/${folderId}?pageSize=${pageSize}&pageToken=${currentToken}`;
      if (filter !== 'all') {
        url += `&filter=${filter}`;
      }
      
      try {
        const response = await fetch(url);
        if (!response.ok) break;
        
        const result = await response.json();
        const nextToken = result.nextPageToken || '';
        
        if (nextToken) {
          const nextPage = currentPage + 1;
          previousTokens.push(currentToken);
          tokenMap.set(nextPage, nextToken);
          currentPage = nextPage;
          currentToken = nextToken;
        } else {
          break; // No more pages
        }
      } catch (error) {
        console.error('Error fetching page:', error);
        break;
      }
    }
    
    // Update all states
    setCurrentPageToken(currentToken);
    setCurrentPageNumber(currentPage);
    setPreviousPageTokens(previousTokens);
    setPageTokenMap(tokenMap);
  };

  const navigateBackwardTo = (targetPage: number) => {
    if (targetPage < 1) return;
    
    const token = pageTokenMap.get(targetPage) || '';
    setCurrentPageToken(token);
    setCurrentPageNumber(targetPage);
    
    // Rebuild previousPageTokens
    const newPreviousTokens: string[] = [''];
    for (let i = 2; i <= targetPage; i++) {
      newPreviousTokens.push(pageTokenMap.get(i - 1) || '');
    }
    setPreviousPageTokens(newPreviousTokens);
  };

  const hasNextPage = !!nextPageToken;
  const hasPreviousPage = previousPageTokens.length > 1 || (previousPageTokens.length === 1 && currentPageToken !== '');
 
  // File Upload States
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedFiles(Array.from(event.target.files));
    } else {
      setSelectedFiles([]);
    }
  };

  // Mutation for uploading files
  const uploadFileMutation = useMutation({
    mutationFn: async ({ file, folderName, relativePath }: { file: File; folderName: string; relativePath: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder_name', folderName);
      formData.append('relative_path', relativePath);

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/upload/file`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    },
    onSuccess: () => {
      // Individual file success is handled by the loop, overall success by handleUploadAllFiles
    },
    onError: (error) => {
      console.error(`ファイルのアップロードに失敗しました: ${error.message}`);
      setUploadStatus(`一部のファイルのアップロードに失敗しました: ${error.message}`);
    },
  });

  const handleUploadAllFiles = async () => {
    if (selectedFiles.length === 0) {
      alert('アップロードするファイルを選択してください。');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadStatus('アップロード中...');

    let successfulUploads = 0;
    let failedUploads = 0;

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const webkitRelativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name; // Fallback to file.name if webkitRelativePath is not available

      // Extract the top-level folder name from webkitRelativePath
      let folderName = '';
      let relativePath = webkitRelativePath;

      const pathParts = webkitRelativePath.split('/');
      if (pathParts.length > 1) {
        folderName = pathParts[0];
        relativePath = pathParts.slice(1).join('/');
      } else {
        // If it's a single file not in a folder, use a default folder name or handle as root
        // For now, let's use the current folderId as the folderName if it's a single file upload
        // Or, if the user explicitly selects a folder, the first part of webkitRelativePath is the folder name.
        // If it's just a file, we can use a generic "Uploaded Files" folder or the current folderId.
        // Given the user wants "第1回" etc., we should ensure folderName is derived from the selected folder.
        // If a single file is selected without a folder, we might need a different approach or prompt the user.
        // For now, if webkitRelativePath has no slashes, assume it's a file directly in the target folder.
        // The user's request implies uploading *folders*, so webkitRelativePath will likely have a folder name.
        folderName = folderId || 'Uploaded Files'; // Fallback if no folder context
        relativePath = file.name; // Use original file name as relative path
      }

      try {
        await uploadFileMutation.mutateAsync({ file, folderName, relativePath });
        successfulUploads++;
      } catch (error) {
        failedUploads++;
        console.error(`ファイル ${file.name} のアップロードに失敗しました:`, error);
      }
      setUploadProgress(Math.round(((i + 1) / selectedFiles.length) * 100));
    }

    setUploading(false);
    setSelectedFiles([]); // Clear selected files after upload attempt

    if (successfulUploads > 0 && failedUploads === 0) {
      setUploadStatus('すべてのファイルが正常にアップロードされました！');
      alert('すべてのファイルが正常にアップロードされました！');
    } else if (successfulUploads > 0 && failedUploads > 0) {
      setUploadStatus(`${successfulUploads} 個のファイルがアップロードされ、${failedUploads} 個のファイルが失敗しました。`);
      alert(`${successfulUploads} 個のファイルがアップロードされ、${failedUploads} 個のファイルが失敗しました。`);
    } else {
      setUploadStatus('ファイルのアップロードに失敗しました。');
      alert('ファイルのアップロードに失敗しました。');
    }
    queryClient.invalidateQueries({ queryKey: ['files', folderId] }); // Re-fetch files after successful upload
    queryClient.invalidateQueries({ queryKey: ['folders'] }); // Re-fetch folders to show new ones
  };

  // WebSocket for real-time updates
  useEffect(() => {
    if (!folderId) return;
    const ws = new WebSocket(`${import.meta.env.VITE_API_BASE_URL.replace('http', 'ws')}/ws`);
    ws.onopen = () => console.log(`WebSocket connection established for folder context: ${folderId}`);
    ws.onmessage = (event) => {
      console.log('WebSocket message received on FolderPage:', event.data);
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
  }, [folderId, queryClient]);

  const renderMediaPreview = (file: FileMetadata, isSelectedVideoPlayer = false) => {
    const commonLinkProps = { target: "_blank", rel: "noopener noreferrer" };
    console.log(`renderMediaPreview: file.name=${file.name}, file.mimeType=${file.mimeType}, isSelectedVideoPlayer=${isSelectedVideoPlayer}, downloadUrl=${file.downloadUrl}`);

    if (isSelectedVideoPlayer) {
      if (!file.mimeType.startsWith('video/') && !file.mimeType.startsWith('audio/')) {
        return null;
      }
      return (
        <video
          src={file.downloadUrl}
          controls
          autoPlay
          className="selected-video-iframe" // Reusing class name for styling consistency
          title={file.name}
          style={{ border: 'none', width: '100%', height: '100%' }}
        >
          Your browser does not support the video tag.
        </video>
      );
    } else {
      if (file.mimeType.startsWith('image/')) {
        return <img src={file.downloadUrl} alt={file.name} className="media-preview" loading="lazy" onClick={() => handleFileClick(file)} />;
      } else if (file.mimeType.startsWith('video/') || file.mimeType.startsWith('audio/')) {
        return (
          <div style={{ position: 'relative', width: '100%', height: '150px' }}>
            <video
              src={file.downloadUrl}
              className="media-preview"
              title={file.name}
              style={{ border: 'none', width: '100%', height: '100%' }}
              preload="metadata" // Load metadata to show first frame if possible
            >
              Your browser does not support the video tag.
            </video>
            <div className="media-overlay" onClick={() => handleFileClick(file)}></div>
          </div>
        );
      } else {
        return (
          <div className="media-preview-placeholder" onClick={() => handleFileClick(file)}>
            <span role="img" aria-label="file icon" style={{fontSize: "2em"}}>📄</span>
            <p className="file-name-placeholder">{file.name}</p>
            <p className="file-type-placeholder"><small>{file.mimeType}</small></p>
            {file.downloadUrl && <a href={file.downloadUrl} {...commonLinkProps} onClick={(e) => { e.stopPropagation(); window.open(file.downloadUrl, '_blank', 'noopener,noreferrer'); }}>Download File</a>}
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

  const filteredFiles = files;

  return (
    <div className="page-container">
      <h1>Files in: {folderName || folderId}</h1>
      <p className="breadcrumb-link"><Link to="/">↩ Back to Folders</Link></p>

      <div className="filter-buttons">
        <button onClick={() => {
          setFilter('all');
          // Reset pagination when filter changes
          setCurrentPageToken('');
          setPreviousPageTokens(['']);
          setCurrentPageNumber(1);
          setPageTokenMap(new Map([[1, '']]));
          setEstimatedTotalPages(5);
        }} className={filter === 'all' ? 'active' : ''}>すべて</button>
        <button onClick={() => {
          setFilter('image');
          // Reset pagination when filter changes
          setCurrentPageToken('');
          setPreviousPageTokens(['']);
          setCurrentPageNumber(1);
          setPageTokenMap(new Map([[1, '']]));
          setEstimatedTotalPages(5);
        }} className={filter === 'image' ? 'active' : ''}>写真 📷</button>
        <button onClick={() => {
          setFilter('video');
          // Reset pagination when filter changes
          setCurrentPageToken('');
          setPreviousPageTokens(['']);
          setCurrentPageNumber(1);
          setPageTokenMap(new Map([[1, '']]));
          setEstimatedTotalPages(5);
        }} className={filter === 'video' ? 'active' : ''}>動画 🎥</button>
      </div>

      {/* File Upload Section */}
      {/* File Upload Section */}
      <div className="file-upload-section">
        {/* @ts-expect-error webkitdirectory is not in standard HTML input attributes */}
        <input type="file" onChange={handleFileChange} webkitdirectory="true" directory="true" multiple />
        <button 
          onClick={handleUploadAllFiles} 
          disabled={selectedFiles.length === 0 || uploading}
        >
          {uploading ? `アップロード中... (${uploadProgress}%)` : 'フォルダ/ファイルをアップロード'}
        </button>
        {uploading && <p>進捗: {uploadProgress}%</p>}
        {uploadStatus && <p>{uploadStatus}</p>}
      </div>

      {selectedVideoUrl && (
        <div className="selected-video-container">
          <button onClick={closeSelectedVideo} className="close-selected-video-button">×</button>
          {(() => {
            const selectedFile = (files || []).find(f => f.downloadUrl === selectedVideoUrl); // Find by downloadUrl
            return selectedFile ? renderMediaPreview(selectedFile, true) : null;
          })()}
        </div>
      )}

      {selectedImageUrl && (
        <div className="selected-image-modal-container">
          <button onClick={closeSelectedImage} className="close-selected-image-button">×</button>
          <img src={selectedImageUrl} alt="Selected Image" className="selected-image-modal" />
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
        
        <div className="page-numbers">
          {Array.from({ length: currentEstimatedPages }, (_, i) => i + 1).map(pageNum => {
            const hasToken = pageTokenMap.has(pageNum);
            const isCurrentPage = pageNum === currentPageNumber;
            const isDisabled = isCurrentPage || (isNavigating && !hasToken);
            
            return (
              <button
                key={pageNum}
                onClick={() => handlePageClick(pageNum)}
                className={isCurrentPage ? 'active' : (!hasToken ? 'unknown' : '')}
                disabled={isDisabled}
                title={!hasToken && pageNum > currentPageNumber ? 'クリックしてページを読み込み' : undefined}
              >
                {isNavigating && !hasToken && pageNum > currentPageNumber ? '...' : pageNum}
              </button>
            );
          })}
        </div>
        
        <button onClick={handleNextPage} disabled={!hasNextPage}>次へ</button>
      </div>
    </div>
  );
}

// Define the structure of a Profile object
interface Profile {
  id?: string; // Firestore document ID, optional for new profiles
  name: string;
  bio: string;
  icon_url: string;
}

// --- ProfileList Component ---
function ProfileList() {
  const { data: profiles, isLoading, error } = useQuery<Profile[], Error>({
    queryKey: ['profiles'],
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/profiles`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      return result.data || [];
    },
  });

  if (isLoading) {
    return <div className="page-container">Loading profiles...</div>;
  }

  if (error) {
    return <div className="page-container">Error fetching profiles: {error.message}</div>;
  }

  return (
    <div className="page-container">
      <h1>メンバープロフィール</h1>
      <p className="breadcrumb-link"><Link to="/">↩ トップページに戻る</Link></p>
      <Link to="/profiles/new/edit" className="add-profile-link">新しいプロフィールを追加</Link>
      {(profiles || []).length === 0 ? (
        <p>プロフィールが見つかりませんでした。</p>
      ) : (
        <div className="profile-grid">
          {(profiles || []).map((profile) => (
            <div key={profile.id} className="profile-card">
              <img src={profile.icon_url || '/vite.svg'} alt={profile.name} className="profile-icon" />
              <h2>{profile.name}</h2>
              <div className="profile-bio">
                <ReactMarkdown>{profile.bio}</ReactMarkdown>
              </div>
              <Link to={`/profiles/${profile.id}/edit`} className="edit-profile-link">編集</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- ProfileEditForm Component ---
function ProfileEditForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isNew = id === 'new';
  const profileId: string | null = isNew ? null : (id || null);

  console.log('ProfileEditForm: id param =', id);
  console.log('ProfileEditForm: isNew =', isNew);
  console.log('ProfileEditForm: profileId (string | null) =', profileId);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [currentIconUrl, setCurrentIconUrl] = useState<string>('');

  // Fetch existing profile data if editing
  const { data: existingProfile, isLoading: isLoadingProfile, error: profileError } = useQuery<Profile, Error>({
    queryKey: ['profile', profileId || null],
    queryFn: async () => {
      if (!profileId) throw new Error('Profile ID is missing');
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/profiles/${profileId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    },
    enabled: !isNew && !!profileId,
  });

  useEffect(() => {
    if (existingProfile) {
      console.log('ProfileEditForm: existingProfile data received:', existingProfile);
      setName(existingProfile.name);
      setBio(existingProfile.bio);
      setCurrentIconUrl(existingProfile.icon_url || '');
    } else {
      console.log('ProfileEditForm: existingProfile is null or undefined.');
      setCurrentIconUrl('');
    }
  }, [existingProfile]);

  // Mutation for uploading icon
  const uploadIconMutation = useMutation({
    mutationFn: async ({ file, profileId: idToUpload }: { file: File; profileId: string }) => {
      const formData = new FormData();
      formData.append('icon', file);
      formData.append('profile_id', idToUpload);

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/upload/icon`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    },
  });

  const createProfileMutation = useMutation({
    mutationFn: async (newProfile: Profile) => {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProfile),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      navigate('/profiles');
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (updatedProfile: Profile) => {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/profiles/${updatedProfile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProfile),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      if (profileId) {
        const keyProfileId: string = profileId;
        queryClient.invalidateQueries({ queryKey: ['profile', keyProfileId] });
      }
      navigate('/profiles');
    },
  });

  // Mutation for deleting profile
  const deleteProfileMutation = useMutation({
    mutationFn: async (idToDelete: string) => {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/profiles/${idToDelete}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      navigate('/profiles');
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let finalIconUrl = currentIconUrl;

    try {
      let profileToSave: Profile;
      let createdProfileId: string | null = profileId;

      if (isNew) {
        const tempProfile: Profile = { name, bio, icon_url: '' };
        const createdProfile = await createProfileMutation.mutateAsync(tempProfile);
        createdProfileId = createdProfile.id || null;
        if (!createdProfileId) {
          throw new Error('Failed to get ID for new profile.');
        }
        profileToSave = { ...createdProfile, name, bio };
      } else {
        profileToSave = { name, bio, icon_url: currentIconUrl, id: profileId! };
      }

      if (iconFile && createdProfileId) {
        const uploadResult = await uploadIconMutation.mutateAsync({ file: iconFile, profileId: createdProfileId });
        finalIconUrl = uploadResult.icon_url;
        profileToSave.icon_url = finalIconUrl;
      } else if (iconFile && !createdProfileId) {
        throw new Error('Cannot upload icon without a profile ID.');
      }

      if (isNew) {
        await updateProfileMutation.mutateAsync({ ...profileToSave, id: createdProfileId! });
      } else if (profileId) {
        await updateProfileMutation.mutateAsync({ ...profileToSave, id: profileId });
      }
      alert('プロフィールを保存しました！');
    } catch (saveError) {
      alert(`プロフィールの保存に失敗しました: ${saveError}`);
    }
  };

  const handleDelete = async () => {
    if (!profileId) {
      alert('削除するプロフィールが選択されていません。');
      return;
    }
    if (window.confirm('本当にこのプロフィールを削除しますか？')) {
      try {
        await deleteProfileMutation.mutateAsync(profileId);
        alert('プロフィールを削除しました。');
      } catch (deleteError) {
        alert(`プロフィールの削除に失敗しました: ${deleteError}`);
      }
    }
  };


  if (!isNew && isLoadingProfile) {
    return <div className="page-container">Loading profile for editing...</div>;
  }

  if (!isNew && profileError) {
    return <div className="page-container">Error fetching profile: {profileError.message}</div>;
  }

  return (
    <div className="page-container">
      <h1>{isNew ? '新しいプロフィールを作成' : `${name}のプロフィールを編集`}</h1>
      <p className="breadcrumb-link"><Link to="/profiles">↩ プロフィール一覧に戻る</Link></p>

      <form onSubmit={handleSubmit} className="profile-edit-form">
        <div className="form-group">
          <label htmlFor="name">名前:</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="bio">紹介文 (Markdown):</label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={10}
          ></textarea>
        </div>
        <div className="form-group">
          <label htmlFor="icon">アイコン画像:</label>
          {currentIconUrl && (
            <div className="current-icon-preview">
              <p>現在のアイコン:</p>
              <img src={currentIconUrl} alt="Current Icon" className="profile-icon-preview" />
            </div>
          )}
          <input
            type="file"
            id="icon"
            accept="image/*"
            onChange={(e) => setIconFile(e.target.files ? e.target.files[0] : null)}
          />
          {iconFile && <p>選択中のファイル: {iconFile.name}</p>}
        </div>
        <div className="form-actions">
          <button type="submit" disabled={createProfileMutation.isPending || updateProfileMutation.isPending || uploadIconMutation.isPending}>
            {createProfileMutation.isPending || updateProfileMutation.isPending || uploadIconMutation.isPending ? '保存中...' : '保存'}
          </button>
          {!isNew && (
            <button type="button" onClick={handleDelete} className="delete-button" disabled={deleteProfileMutation.isPending}>
              {deleteProfileMutation.isPending ? '削除中...' : '削除'}
            </button>
          )}
        </div>
      </form>
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
          <Route path="/folder/*" element={<FolderPage />} />
          <Route path="/profiles" element={<ProfileList />} />
          <Route path="/profiles/:id/edit" element={<ProfileEditForm />} />
        </Routes>
      </main>
      {/* A global footer could go here */}
    </>
  );
}

export default App
export { App }
