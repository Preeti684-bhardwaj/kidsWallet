const Minio = require('minio');
const crypto = require('crypto');
const path = require('path');

// -----------------MinIO client instance-----------------------------------
const minioClient = new Minio.Client({
  endPoint: process.env.ENDPOINT,
  port: parseInt(process.env.MINIO_PORT),
  useSSL: true,
  accessKey: process.env.ACCESS_KEY,
  secretKey: process.env.SECRET_KEY,
  region: process.env.REGION
});

const bucketName = process.env.BUCKET_NAME;

//---------------CDN configuration-----------------------------------------
const cdnConfig = {
  domain: process.env.CDN_DOMAIN || process.env.ENDPOINT, // Fallback to endpoint if no CDN domain
  enabled: process.env.CDN_ENABLED === 'true' || false
};

// -----------Verify MinIO connection and bucket---------------------------
const verifyMinioConnection = async () => {
  try {
    const exists = await minioClient.bucketExists(bucketName);
    if (!exists) {
      throw new Error(`Bucket '${bucketName}' does not exist`);
    }
    return true;
  } catch (error) {
    console.error('MinIO Connection Error:', error);
    throw new Error(`MinIO Connection Failed: ${error.message}`);
  }
};

// -------------Generate unique filename with sanitization-------------------------------
const generateUniqueFileName = (originalName) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const sanitizedName = path.basename(originalName).replace(/[^a-zA-Z0-9.-]/g, '_');
  const extension = path.extname(sanitizedName).toLowerCase();
  return `${timestamp}-${randomString}${extension}`;
};

// -----------------URL generation------------------------------------------- 
const generateFileUrl = (fileName) => {
  // If CDN is enabled, use CDN domain, otherwise fallback to original endpoint
  const domain = cdnConfig.enabled ? cdnConfig.domain : process.env.ENDPOINT;
  return `https://${domain}/${fileName}`;
};

// -----------------Upload a single file------------------------------------- 
const uploadFile = async (file) => {
  try {
    // Verify connection before upload
    await verifyMinioConnection();

    // Validate file
    if (!file || !file.buffer || !file.originalname) {
      throw new Error('Invalid file object');
    }

    const fileName = generateUniqueFileName(file.originalname);
    
    const metaData = {
      'Content-Type': file.mimetype || 'application/octet-stream',
      'Content-Length': file.buffer.length,
      'Original-Name': file.originalname
    };
    
    // Upload with retry mechanism
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        await minioClient.putObject(
          bucketName,
          fileName,
          file.buffer,
          metaData
        );
        break;
      } catch (error) {
        attempts++;
        console.log("error of stack",error.stack);
        console.log("error message",error.message);
        if (attempts === maxAttempts) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }

    // Generate URL using new method
    const fileUrl = generateFileUrl(fileName);
    
    return {
      url: fileUrl,
      filename: fileName,
      originalName: file.originalname,
      size: file.buffer.length,
      mimetype: file.mimetype || 'application/octet-stream',
      cdnEnabled: cdnConfig.enabled
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error(`File upload failed: ${error.message}`);
  }
};

// ---------------Handle multiple file uploads--------------------------------
const uploadFiles = async (files) => {
  if (!Array.isArray(files)) {
    throw new Error('Files must be an array');
  }

  if (files.length === 0) {
    return [];
  }

  try {
    const uploadPromises = files.map(file => uploadFile(file));
    const results = await Promise.all(uploadPromises);
    return results;
  } catch (error) {
    throw new Error(`Multiple file upload failed: ${error.message}`);
  }
};

// -------------Delete a single file from CDN--------------------------------
const deleteFile = async (fileName) => {
  try {
    await verifyMinioConnection();
    
    // Check if file exists before deletion
    try {
      await minioClient.statObject(bucketName, fileName);
    } catch (error) {
      if (error.code === 'NotFound') {
        throw new Error(`File ${fileName} not found`);
      }
      throw error;
    }
    await minioClient.removeObject(bucketName, fileName);
    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    throw new Error(`File deletion failed: ${error.message}`);
  }
};

// ----------------List all files in the bucket------------------------------------
const listFiles = async (prefix = '') => {
  try {
    await verifyMinioConnection();
    
    const files = [];
    const stream = minioClient.listObjects(bucketName, prefix, true);
    
    return new Promise((resolve, reject) => {
      stream.on('data', (obj) => {
        files.push({
          name: obj.name,
          size: obj.size,
          lastModified: obj.lastModified,
          url: generateFileUrl(obj.name),
          cdnEnabled: cdnConfig.enabled
        });
      });
      
      stream.on('error', (err) => {
        reject(new Error(`Error listing files: ${err.message}`));
      });
      
      stream.on('end', () => {
        resolve(files);
      });
    });
  } catch (error) {
    console.error('Error listing files:', error);
    throw new Error(`File listing failed: ${error.message}`);
  }
};

module.exports = {
  uploadFile,
  uploadFiles,
  deleteFile,
  verifyMinioConnection,
  listFiles
};