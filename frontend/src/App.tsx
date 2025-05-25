import { useState, useEffect } from 'react';
import { Routes, Route, Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'; // Added useMutation
import ReactMarkdown from 'react-markdown'; // Will be installed
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
    queryKey: ['files', folderId, currentPageToken, pageSize, filter], // Add filter to queryKey
    queryFn: async () => {
      if (!folderId) throw new Error('Folder ID is missing');
      let url = `${import.meta.env.VITE_API_BASE_URL}/api/files/${folderId}?pageSize=${pageSize}&pageToken=${currentPageToken}`;
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
    const ws = new WebSocket(`${import.meta.env.VITE_API_BASE_URL.replace('http', 'ws')}/ws`);
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

// Define the structure of a Profile object
interface Profile {
  id?: string; // Changed from number to string, as Firestore IDs are strings
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
  const profileId = isNew ? null : id; // Use id directly as string

  console.log('ProfileEditForm: id param =', id);
  console.log('ProfileEditForm: isNew =', isNew);
  console.log('ProfileEditForm: profileId (string) =', profileId);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreviewUrl, setIconPreviewUrl] = useState<string | null>(null);

  // Fetch existing profile data if editing
  const { data: existingProfile, isLoading: isLoadingProfile, error: profileError } = useQuery<Profile, Error>({
    queryKey: ['profile', profileId],
    queryFn: async () => {
      if (!profileId) throw new Error('Profile ID is missing');
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/profiles/${profileId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    },
    enabled: !isNew && !!profileId, // Only fetch if not new and ID is valid
  });

  useEffect(() => {
    if (existingProfile) {
      console.log('ProfileEditForm: existingProfile data received:', existingProfile);
      setName(existingProfile.name);
      setBio(existingProfile.bio);
      setIconPreviewUrl(existingProfile.icon_url);
    } else {
      console.log('ProfileEditForm: existingProfile is null or undefined.');
    }
  }, [existingProfile]);

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
      queryClient.invalidateQueries({ queryKey: ['profile', profileId] });
      navigate('/profiles');
    },
  });

  const uploadIconMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('icon', file);
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/upload/icon`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      return result.icon_url;
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let finalIconUrl = iconPreviewUrl || '';

    if (iconFile) {
      try {
        finalIconUrl = await uploadIconMutation.mutateAsync(iconFile);
      } catch (uploadError) {
        alert(`アイコンのアップロードに失敗しました: ${uploadError}`);
        return;
      }
    }

    const profileData: Profile = { name, bio, icon_url: finalIconUrl };

    try {
      if (isNew) {
        await createProfileMutation.mutateAsync(profileData);
      } else if (profileId) {
        await updateProfileMutation.mutateAsync({ ...profileData, id: profileId });
      }
      alert('プロフィールを保存しました！');
    } catch (saveError) {
      alert(`プロフィールの保存に失敗しました: ${saveError}`);
    }
  };

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIconFile(file);
      setIconPreviewUrl(URL.createObjectURL(file)); // Create a local URL for preview
    } else {
      setIconFile(null);
      setIconPreviewUrl(null);
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
          <input
            type="file"
            id="icon"
            accept="image/*"
            onChange={handleIconChange}
          />
          {iconPreviewUrl && (
            <div className="icon-preview">
              <img src={iconPreviewUrl} alt="Icon Preview" />
            </div>
          )}
        </div>
        <button type="submit" disabled={createProfileMutation.isPending || updateProfileMutation.isPending || uploadIconMutation.isPending}>
          {createProfileMutation.isPending || updateProfileMutation.isPending || uploadIconMutation.isPending ? '保存中...' : '保存'}
        </button>
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
          <Route path="/folder/:folderId" element={<FolderPage />} />
          <Route path="/profiles" element={<ProfileList />} />
          <Route path="/profiles/:id/edit" element={<ProfileEditForm />} />
        </Routes>
      </main>
      {/* A global footer could go here */}
    </>
  );
}

export default App;
