# CLI Tools

This directory contains command-line utilities for managing the Luke Avenue Drive Gallery.

## Tools Available

### `metadata-updater/`
Command-line tool for updating file metadata in Firestore database.

**Usage**:
```bash
cd tools/metadata-updater
go run main.go
```

### `uploader/`
Batch file upload utility for uploading large numbers of files to Firebase Storage.

**Usage**:
```bash
cd tools/uploader
go run main.go
```

## Building Tools

To build the tools as standalone executables:

```bash
# Build metadata updater
cd tools/metadata-updater
go build -o updater main.go

# Build uploader
cd tools/uploader
go build -o uploader main.go
```

The built binaries (`updater` and `uploader`) are ignored by git and should not be committed.

## Configuration

Each tool may require environment variables or configuration files. Check the individual tool directories for specific requirements.