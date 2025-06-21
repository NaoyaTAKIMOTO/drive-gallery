# Configuration Files

This directory contains configuration files for Firebase and deployment.

## Files

### `firebase.json`
Firebase project configuration for:
- **Hosting**: Frontend deployment settings
- **Storage**: Security rules reference

### `storage.rules`
Firebase Storage security rules defining:
- **Read permissions**: Public read access
- **Write permissions**: Authenticated users only

### `cors.json`
CORS (Cross-Origin Resource Sharing) policy for Firebase Storage bucket.
Allows the frontend to access storage resources from different domains.

## Usage

### Deploy Firebase configuration
```bash
firebase deploy --config config/firebase.json
```

### Update Storage CORS
```bash
gsutil cors set config/cors.json gs://your-bucket-name
# or use: make set-cors
```

## Security Notes

- `storage.rules` should be reviewed carefully to ensure proper access control
- CORS configuration should be as restrictive as possible while allowing necessary access
- Test security rules in Firebase Console before deploying to production