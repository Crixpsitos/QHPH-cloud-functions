# Storage Optimization Triggers

Handles optimization of images and videos uploaded to Cloud Storage for any resource type (events, sites, etc.).

## ✅ Optimizable Folders

Currently configured storage paths that trigger optimization:

- **events** - Optimize media for events
- **sites** - Optimize media for sites

### Path Structure

```
public/{folderType}/{resourceId}/{mediaType}/
```

Example:
- `public/events/event-123/images/photo.jpg`
- `public/events/event-123/videos/video.mp4`
- `public/sites/site-456/images/banner.png`
- `public/sites/site-456/videos/tour.mp4`

## 📝 Configuration

Add new optimizable folders in [storageOptimization.config.ts](./config/storageOptimization.config.ts):

```typescript
export const OPTIMIZABLE_FOLDERS = {
  EVENTS: "events",
  SITES: "sites",
  PRODUCTS: "products", // Example: agregar nuevo tipo
} as const;
```

## 🎬 Functions

### `onObjectFinalizedOptimizeImages`
- Compresses images (JPEG, PNG, WebP)
- Extracts width and height
- Stores optimized image in the same folder
- Updates Firestore document with image metadata

### `onObjectFinalizedOptimizeVideos`
- Processes and optimizes videos (MP4, MOV, AVI, WebM, 3GP)
- Max file size: 200MB
- Extracts video duration, width, height
- Generates thumbnail image automatically
- Stores optimized video and thumbnail
- Updates Firestore with video metadata

## 🔄 Supported Media Types

### Images
- `image/jpeg`
- `image/png`
- `image/webp`
- `image/jpg`

### Videos
- `video/mp4`
- `video/quicktime` (MOV)
- `video/x-msvideo` (AVI)
- `video/webm`
- `video/3gpp` (3GP)

## 📊 Resource Updates

When optimization completes, Firestore is updated at path `{folderType}/{resourceId}`:

### Main Image
```typescript
{
  "mainImage": {
    "status": "ready" | "error",
    "path": "compressed path",
    "url": "public URL",
    "temporaryUrl": FieldValue.delete() // Removed after optimization
  }
}
```

### Gallery Media
```typescript
{
  "media": [
    {
      "data": {
        "status": "ready" | "error",
        "url": "optimized URL",
        "path": "storage path",
        "originalPath": "original upload path",
        "width": number,
        "height": number,
        "duration": number, // seconds (videos only)
        "thumbnailUrl": string, // (videos only)
        "thumbnailPath": string // (videos only)
      }
    }
  ]
}
```

## 🚀 Adding a New Optimizable Resource Type

1. Add to `OPTIMIZABLE_FOLDERS` in config file
2. Functions automatically support the new type
3. Ensure Firestore documents follow the same structure

Example: To add support for "products":
```typescript
export const OPTIMIZABLE_FOLDERS = {
  EVENTS: "events",
  SITES: "sites",
  PRODUCTS: "products", // Add this line
} as const;
```

Upload path structure:
- `public/products/{productId}/images/photo.jpg`
- `public/products/{productId}/videos/demo.mp4`

## ⚙️ Performance

- **Images**: 1 GiB memory, 1 CPU, 10 concurrent
- **Videos**: 2 GiB memory, 2 CPU, max 540 seconds timeout
- Video size limit: 200MB

## 🔗 SOLID Principles Applied

- **Single Responsibility**: Each function handles one type of optimization
- **Open/Closed**: Easy to add new resource types without modifying logic
- **Liskov Substitution**: Consistent interface across resource types
- **Interface Segregation**: Config-driven folder validation
- **Dependency Inversion**: Abstract folder validation via config
