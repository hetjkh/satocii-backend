const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const https = require('https');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 5000;

// Cloudinary Configuration
cloudinary.config({
  cloud_name: 'dvrko1y0a', // Replace with your Cloudinary cloud name
  api_key: '718679757661864',       // Replace with your Cloudinary API key
  api_secret: 'U7urAnAcBIyXSeGgkJL6ylv0uGo'  // Replace with your Cloudinary API secret
});

// Configure multer for memory storage (upload to memory before cloudinary)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for images
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Configure multer for video uploads
const uploadVideo = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit for videos
  },
  fileFilter: (req, file, cb) => {
    // Accept videos only
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed!'), false);
    }
  }
});

// MongoDB connection
const MONGODB_URI = 'mongodb+srv://hetjani818_db_user:123@cluster0.v1x2mx9.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// Middleware
app.use(compression()); // Compress responses to reduce size
app.use(cors({
  origin: [
    'https://satocc-coral.vercel.app',
    'http://localhost:3000',
    'https://satocci.com'
  ],
  credentials: true
}));
app.use(bodyParser.json());

// ✅ LinkedIn API Configuration
const LINKEDIN_CONFIG = {
  accessToken: 'AQX6Wl15nFb0wIQb3PEL8e8GaONeK8Ch1pXwMWCL2Wg7mA_SWRroGNl83GlwBoChKkQy6vwDRvgjbK_PO3WMEktyHHJkJVqVx840HER5wskvuQbaaSAA9TzPAdKfNiaChGZK5GgpUlqXb7s4uBml8BnmTr8FQ_UzKEWr5-yxZEwUv872gHucUtEnMSwfD_FKTfeVvefNm8mDt_a2gvmNZJLuKxMU2xnN-5Aaqj56UGBljrtz0hlH3355KjAZFbugYg02K-dis9JeoosQsdCTgYpcEQSwgY7oYaN6AIcVxwzs40XK05SgbkY4X0PAWlin8D188ujicVo4WdrtWc92AA0d1DgKBw'
};


// ✅ Define Schema & Model for Social Posts
const postSchema = new mongoose.Schema({
  platform: { type: String, required: true },  // e.g. 'linkedin'
  postUrl: { type: String },                    // embed link
  content: { type: String, required: true },    // post content
  title: { type: String },                      // post title
  linkedinPostId: { type: String },            // LinkedIn post ID for tracking
  linkedinUserId: { type: String },             // LinkedIn user ID (sub field)
  mediaType: { type: String, default: 'NONE' }, // NONE, ARTICLE, VIDEO, IMAGE, etc.
  mediaUrl: { type: String },                   // URL for media content
  mediaTitle: { type: String },                 // Title for media content
  mediaDescription: { type: String },           // Description for media content
  mediaThumbnail: { type: String },             // Thumbnail URL for media
  uploadedImages: [{ type: String }],           // Array of Cloudinary image URLs
  uploadedVideo: { type: String },              // LinkedIn asset URN (for videos uploaded directly)
  uploadedVideoThumbnail: { type: String },     // Custom video thumbnail URL
  postToLinkedIn: { type: Boolean, default: true }, // Whether to post to LinkedIn or just save
  status: { type: String, default: 'pending' } // pending, posted, failed, saved
}, { timestamps: true });

// ✅ Add indexes for better query performance
postSchema.index({ status: 1, createdAt: -1 }); // Compound index for status + date sorting
postSchema.index({ createdAt: -1 }); // Index for date sorting
postSchema.index({ status: 1 }); // Index for status filtering

const Post = mongoose.model('Post', postSchema);

// ✅ Define Schema & Model for Reviews
const reviewSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, required: true },
  content: { type: String, required: true },
  type: { type: String, required: true, enum: ['text', 'image', 'video'] }, // text, image, video
  mediaUrl: { type: String }, // Cloudinary URL for image or video URL
  imageUrl: { type: String }, // Profile image URL
  order: { type: Number, default: 0 }, // For ordering reviews
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const Review = mongoose.model('Review', reviewSchema);

// ✅ Define Schema & Model for Team Members
const teamMemberSchema = new mongoose.Schema({
  name: { type: String, required: true },
  title: { type: String, required: true },
  experience: { type: String, required: true },
  image: { type: String, required: true }, // Cloudinary URL
  order: { type: Number, default: 0 }, // For ordering team members
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const TeamMember = mongoose.model('TeamMember', teamMemberSchema);

// ✅ LinkedIn API Helper Functions
async function getLinkedInUserInfo() {
  try {
    const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${LINKEDIN_CONFIG.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching LinkedIn user info:', error.response?.data || error.message);
    throw error;
  }
}

// Upload image to LinkedIn and get media URN (accepts file buffer directly)
async function uploadImageToLinkedIn(imageBuffer, userInfo) {
  try {
    console.log('📸 Uploading image to LinkedIn directly from buffer');
    console.log('📦 Image buffer size:', imageBuffer.length, 'bytes');
    
    const personUrn = `urn:li:person:${userInfo.sub}`;
    
    // Step 1: Register the upload for image
    const registerUploadResponse = await axios.post(
      'https://api.linkedin.com/v2/assets?action=registerUpload',
      {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: personUrn,
          serviceRelationships: [
            {
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent'
            }
          ]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${LINKEDIN_CONFIG.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );

    // Extract upload URL and asset from response
    const uploadMechanism = registerUploadResponse.data.value.uploadMechanism;
    if (!uploadMechanism || !uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']) {
      throw new Error('Invalid response from LinkedIn: missing upload mechanism');
    }
    
    const uploadUrl = uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    let asset = registerUploadResponse.data.value.asset;

    if (!uploadUrl || !asset) {
      console.error('❌ Invalid LinkedIn response:', JSON.stringify(registerUploadResponse.data, null, 2));
      throw new Error('Invalid response from LinkedIn: missing uploadUrl or asset');
    }

    // Ensure asset is a string (URN format: urn:li:digitalmediaAsset:...)
    if (typeof asset !== 'string') {
      console.error('❌ Asset is not a string:', asset, typeof asset);
      throw new Error('Invalid asset format from LinkedIn: expected string URN');
    }

    // Verify asset URN format
    if (!asset.startsWith('urn:li:digitalmediaAsset:')) {
      console.error('❌ Invalid asset URN format:', asset);
      throw new Error(`Invalid asset URN format: ${asset}. Expected format: urn:li:digitalmediaAsset:...`);
    }

    console.log('✅ Image upload registered. Asset URN:', asset);
    console.log('📤 Upload URL:', uploadUrl);

    // Step 2: Upload the image binary directly to LinkedIn
    console.log('📤 Uploading image binary to LinkedIn...');
    
    // Use native https module for binary upload to avoid axios Content-Type issues
    const uploadUrlObj = new URL(uploadUrl);
    const uploadResponse = await new Promise((resolve, reject) => {
      const options = {
        hostname: uploadUrlObj.hostname,
        path: uploadUrlObj.pathname + uploadUrlObj.search,
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${LINKEDIN_CONFIG.accessToken}`,
          'Content-Length': imageBuffer.length
          // Don't set Content-Type - LinkedIn will detect it from binary data
        },
        timeout: 60000 // 1 minute timeout for images
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          // Check for success status codes (200-299)
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              status: res.statusCode,
              statusText: res.statusMessage,
              headers: res.headers,
              data: responseData
            });
          } else {
            const error = new Error(`LinkedIn upload failed with status ${res.statusCode}: ${res.statusMessage}`);
            error.status = res.statusCode;
            error.response = {
              status: res.statusCode,
              statusText: res.statusMessage,
              headers: res.headers,
              data: responseData
            };
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Upload timeout'));
      });

      // Write the image buffer
      req.write(imageBuffer);
      req.end();
    });

    console.log('✅ Image uploaded to LinkedIn successfully');
    console.log('📦 Upload response status:', uploadResponse.status);

    if (!asset) {
      throw new Error('No asset URN received from LinkedIn upload registration');
    }

    console.log('✅ Returning asset URN:', asset);
    return asset; // Return the asset URN
  } catch (error) {
    console.error('❌ Error uploading image to LinkedIn:');
    console.error('   - Error message:', error.message);
    console.error('   - Status code:', error.response?.status || error.status);
    console.error('   - Response data:', JSON.stringify(error.response?.data, null, 2));
    
    // Provide more helpful error messages
    if (error.response?.status === 401 || error.status === 401) {
      throw new Error('LinkedIn authentication failed. Please check your access token and ensure it has w_member_social permission.');
    } else if (error.response?.status === 403 || error.status === 403) {
      throw new Error('LinkedIn permission denied. Your app needs w_member_social permission to post images.');
    } else if (error.response?.status === 413 || error.status === 413) {
      throw new Error('Image file too large. LinkedIn supports images up to 20MB.');
    }
    
    throw error;
  }
}

// Upload video to LinkedIn and get media URN (accepts file buffer directly)
async function uploadVideoToLinkedIn(videoBuffer, userInfo) {
  try {
    console.log('🎥 Uploading video to LinkedIn directly from buffer');
    console.log('📦 Video buffer size:', videoBuffer.length, 'bytes');
    
    const personUrn = `urn:li:person:${userInfo.sub}`;
    
    // Step 1: Register the upload for video
    const registerUploadResponse = await axios.post(
      'https://api.linkedin.com/v2/assets?action=registerUpload',
      {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-video'],
          owner: personUrn,
          serviceRelationships: [
            {
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent'
            }
          ]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${LINKEDIN_CONFIG.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );

    // Extract upload URL and asset from response
    const uploadMechanism = registerUploadResponse.data.value.uploadMechanism;
    if (!uploadMechanism || !uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']) {
      throw new Error('Invalid response from LinkedIn: missing upload mechanism');
    }
    
    const uploadUrl = uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    let asset = registerUploadResponse.data.value.asset;

    if (!uploadUrl || !asset) {
      console.error('❌ Invalid LinkedIn response:', JSON.stringify(registerUploadResponse.data, null, 2));
      throw new Error('Invalid response from LinkedIn: missing uploadUrl or asset');
    }

    // Ensure asset is a string (URN format: urn:li:digitalmediaAsset:...)
    if (typeof asset !== 'string') {
      console.error('❌ Asset is not a string:', asset, typeof asset);
      console.error('❌ Full response:', JSON.stringify(registerUploadResponse.data, null, 2));
      throw new Error('Invalid asset format from LinkedIn: expected string URN');
    }

    // Verify asset URN format
    if (!asset.startsWith('urn:li:digitalmediaAsset:')) {
      console.error('❌ Invalid asset URN format:', asset);
      throw new Error(`Invalid asset URN format: ${asset}. Expected format: urn:li:digitalmediaAsset:...`);
    }

    console.log('✅ Video upload registered. Asset URN:', asset);
    console.log('📤 Upload URL:', uploadUrl);

    // Step 2: Upload the video binary directly to LinkedIn
    console.log('📤 Uploading video binary to LinkedIn...');
    
    // Use native https module for binary upload to avoid axios Content-Type issues
    const uploadUrlObj = new URL(uploadUrl);
    const uploadResponse = await new Promise((resolve, reject) => {
      const options = {
        hostname: uploadUrlObj.hostname,
        path: uploadUrlObj.pathname + uploadUrlObj.search,
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${LINKEDIN_CONFIG.accessToken}`,
          'Content-Length': videoBuffer.length
          // Don't set Content-Type - LinkedIn will detect it from binary data
        },
        timeout: 300000
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          // Check for success status codes (200-299)
          if (res.statusCode >= 200 && res.statusCode < 300) {
            // Convert response to axios-like format
            resolve({
              status: res.statusCode,
              statusText: res.statusMessage,
              headers: res.headers,
              data: responseData
            });
          } else {
            // LinkedIn returned an error
            const error = new Error(`LinkedIn upload failed with status ${res.statusCode}: ${res.statusMessage}`);
            error.status = res.statusCode;
            error.response = {
              status: res.statusCode,
              statusText: res.statusMessage,
              headers: res.headers,
              data: responseData
            };
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Upload timeout'));
      });

      // Write the video buffer
      req.write(videoBuffer);
      req.end();
    });

    console.log('✅ Video uploaded to LinkedIn successfully');
    console.log('📦 Upload response status:', uploadResponse.status);

    // According to LinkedIn docs, after successful upload we can use the asset immediately
    // However, for large videos, LinkedIn might need a moment to process
    // Let's add a small delay for videos over 10MB
    if (videoBuffer.length > 10 * 1024 * 1024) {
      console.log('⏳ Large video detected, waiting 2 seconds for LinkedIn to process...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (!asset) {
      throw new Error('No asset URN received from LinkedIn upload registration');
    }

    console.log('✅ Returning asset URN:', asset);
    return asset; // Return the asset URN
  } catch (error) {
    console.error('❌ Error uploading video to LinkedIn:');
    console.error('   - Error message:', error.message);
    console.error('   - Status code:', error.response?.status);
    console.error('   - Response data:', JSON.stringify(error.response?.data, null, 2));
    console.error('   - Full error:', error);
    
    // Provide more helpful error messages
    if (error.response?.status === 401) {
      throw new Error('LinkedIn authentication failed. Please check your access token and ensure it has w_member_social permission.');
    } else if (error.response?.status === 403) {
      throw new Error('LinkedIn permission denied. Your app needs w_member_social permission to post videos.');
    } else if (error.response?.status === 413) {
      throw new Error('Video file too large. LinkedIn supports videos up to 5GB.');
    }
    
    throw error;
  }
}

async function postToLinkedIn(content, options = {}) {
  try {
    const { 
      title = '', 
      mediaType = 'NONE', 
      mediaUrl = '', 
      mediaTitle = '', 
      mediaDescription = '', 
      mediaThumbnail = '',
      uploadedImages = []
    } = options;

    // Get user info to get the user ID
    const userInfo = await getLinkedInUserInfo();
    const authorUrn = `urn:li:person:${userInfo.sub}`;

    // Determine if we have images to post
    const hasUploadedImages = uploadedImages && uploadedImages.length > 0;
    // If mediaType is VIDEO, keep it as VIDEO, otherwise use IMAGE if we have images
    const effectiveMediaType = mediaType === 'VIDEO' ? 'VIDEO' : (hasUploadedImages ? 'IMAGE' : mediaType);

    // Build the post data
    const postData = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: content
          },
          shareMediaCategory: effectiveMediaType
        }
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
      }
    };

    // Handle video uploads - videos should already be uploaded and asset URN provided
    if (mediaType === 'VIDEO' && options.uploadedVideoAssetUrn) {
      console.log('🎥 Processing video post to LinkedIn with asset URN...');
      
      // Use the video asset URN directly (video was already uploaded)
      postData.specificContent['com.linkedin.ugc.ShareContent'].media = [{
        status: 'READY',
        description: {
          text: mediaDescription || content
        },
        media: options.uploadedVideoAssetUrn, // Asset URN from previous upload
        title: {
          text: mediaTitle || title || 'Video Post'
        }
      }];

      // Ensure shareMediaCategory is set to VIDEO
      postData.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'VIDEO';

      console.log('✅ Video media added to post');
      console.log('📦 Asset URN:', options.uploadedVideoAssetUrn);
    }
    // Handle image uploads - images should already be uploaded and asset URNs provided
    else if (mediaType === 'IMAGE' && options.uploadedImageAssetUrns && options.uploadedImageAssetUrns.length > 0) {
      console.log(`📸 Processing image post to LinkedIn with ${options.uploadedImageAssetUrns.length} asset URN(s)...`);
      
      // Use the image asset URNs directly (images were already uploaded)
      postData.specificContent['com.linkedin.ugc.ShareContent'].media = options.uploadedImageAssetUrns.map((assetUrn, index) => ({
        status: 'READY',
        description: {
          text: mediaDescription || content
        },
        media: assetUrn, // Asset URN from previous upload
        title: {
          text: mediaTitle || title || `Image ${index + 1}`
        }
      }));

      // Ensure shareMediaCategory is set to IMAGE
      postData.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'IMAGE';

      console.log('✅ Image media added to post');
      console.log('📦 Asset URNs:', options.uploadedImageAssetUrns);
    }
    // Add uploaded images from Cloudinary URLs if available (legacy support)
    else if (hasUploadedImages) {
      console.log(`🔄 Uploading ${uploadedImages.length} image(s) from Cloudinary to LinkedIn...`);
      
      // Check if images are asset URNs or URLs
      const imageAssetUrns = [];
      const imageUrls = [];
      
      for (let i = 0; i < uploadedImages.length; i++) {
        if (uploadedImages[i].startsWith('urn:li:digitalmediaAsset:')) {
          // It's already an asset URN
          imageAssetUrns.push(uploadedImages[i]);
        } else {
          // It's a URL, need to upload it
          imageUrls.push(uploadedImages[i]);
        }
      }
      
      // Upload URLs to LinkedIn and get media URNs
      for (let i = 0; i < imageUrls.length; i++) {
        try {
          // Download image from URL and upload to LinkedIn
          const imageResponse = await axios.get(imageUrls[i], { responseType: 'arraybuffer' });
          const imageBuffer = Buffer.from(imageResponse.data);
          const assetUrn = await uploadImageToLinkedIn(imageBuffer, userInfo);
          imageAssetUrns.push(assetUrn);
          console.log(`✅ Image ${i + 1}/${imageUrls.length} uploaded successfully`);
        } catch (uploadError) {
          console.error(`❌ Failed to upload image ${i + 1}:`, uploadError.message);
          throw new Error(`Failed to upload image ${i + 1} to LinkedIn: ${uploadError.message}`);
        }
      }

      // Use the media URNs in the post
      postData.specificContent['com.linkedin.ugc.ShareContent'].media = imageAssetUrns.map((assetUrn, index) => ({
        status: 'READY',
        description: {
          text: mediaDescription || content
        },
        media: assetUrn,
        title: {
          text: mediaTitle || title || `Image ${index + 1}`
        }
      }));
      
      // Ensure shareMediaCategory is set to IMAGE
      postData.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'IMAGE';
    }
    // Add media URL if provided (for ARTICLE only - videos are handled above)
    else if (mediaType === 'ARTICLE' && mediaUrl) {
      postData.specificContent['com.linkedin.ugc.ShareContent'].media = [{
        status: 'READY',
        description: {
          text: mediaDescription || content
        },
        originalUrl: mediaUrl,
        title: {
          text: mediaTitle || title
        }
      }];

      // Add thumbnail if provided
      if (mediaThumbnail) {
        postData.specificContent['com.linkedin.ugc.ShareContent'].media[0].thumbnails = [{
          url: mediaThumbnail
        }];
      }
    }

    console.log('📤 Posting to LinkedIn:');
    console.log('   - Media Category:', effectiveMediaType);
    console.log('   - Uploaded Images:', uploadedImages.length);
    console.log('   - Has Video:', mediaType === 'VIDEO');
    console.log('   - Post Data:', JSON.stringify(postData, null, 2));

    // Post to LinkedIn using the UGC Posts API
    // According to docs: POST https://api.linkedin.com/v2/ugcPosts
    // Response should be 201 Created with X-RestLi-Id header
    console.log('📤 Final post data being sent:', JSON.stringify(postData, null, 2));
    
    const response = await axios.post('https://api.linkedin.com/v2/ugcPosts', postData, {
      headers: {
        'Authorization': `Bearer ${LINKEDIN_CONFIG.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      validateStatus: (status) => status >= 200 && status < 300 // Accept 200-299 as success
    });

    console.log('✅ LinkedIn post response status:', response.status);
    console.log('📦 Response status text:', response.statusText);
    console.log('📦 Response headers:', JSON.stringify(response.headers, null, 2));
    console.log('📦 Response data:', JSON.stringify(response.data, null, 2));
    
    // Check for X-RestLi-Id header (post ID)
    const postId = response.headers['x-restli-id'] || response.headers['X-RestLi-Id'] || response.data?.id;
    if (postId) {
      console.log('✅ Post ID from LinkedIn:', postId);
    }

    return {
      ...response.data,
      userInfo: userInfo,
      postId: response.headers['x-restli-id'] || response.data.id
    };
  } catch (error) {
    console.error('❌ Error posting to LinkedIn:');
    console.error('   - Error message:', error.message);
    console.error('   - Status code:', error.response?.status);
    console.error('   - Response data:', JSON.stringify(error.response?.data, null, 2));
    
    // Provide more helpful error messages
    if (error.response?.status === 401) {
      throw new Error('LinkedIn authentication failed. Please check your access token.');
    } else if (error.response?.status === 403) {
      throw new Error('LinkedIn permission denied. Your app needs w_member_social permission.');
    } else if (error.response?.status === 400) {
      throw new Error(`LinkedIn API error: ${JSON.stringify(error.response?.data)}`);
    }
    
    throw error;
  }
}

// ✅ Google Apps Script Web App URL
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwX6sBx2LCfMH_fYgjmXoQY_sswvUptgOA-Jk8JT4rkXhMW6PjGbsqXQ70QlZ4Yf1Vh/exec';


// ✅ API endpoint to submit form data (Retailer signup)
app.post('/api/submit-form', async (req, res) => {
  try {
    const { fullName, address, email, phone, companyUrl, pos, dailyCustomers } = req.body;

    if (!fullName || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, and phone are required fields'
      });
    }

    const formData = new URLSearchParams({
      fullName,
      address: address || '',
      email,
      phone,
      companyUrl: companyUrl || '',
      pos: pos || '',
      dailyCustomers: dailyCustomers || ''
    }).toString();

    const response = await axios.post(GOOGLE_SCRIPT_URL, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400
    });

    if (response.status === 200) {
      res.json({
        success: true,
        message: 'Data submitted successfully',
        data: response.data
      });
    } else {
      throw new Error(`Unexpected response status: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error submitting form:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit form data',
      error: error.message
    });
  }
});

// ✅ Newsletter subscription endpoint
// This collects an email and forwards it to the same Google Apps Script,
// which can be configured to notify info@satocci.com or store in a sheet.
app.post('/api/newsletter', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const formData = new URLSearchParams({
      email,
      source: 'footer_newsletter'
    }).toString();

    const response = await axios.post(GOOGLE_SCRIPT_URL, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400
    });

    if (response.status === 200) {
      return res.json({
        success: true,
        message: 'Newsletter subscription submitted successfully',
        data: response.data
      });
    } else {
      throw new Error(`Unexpected response status: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error submitting newsletter subscription:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit newsletter subscription',
      error: error.message
    });
  }
});



// ✅ Simple in-memory cache for posts (5 minute TTL)
const postsCache = {
  data: null,
  timestamp: null,
  ttl: 5 * 60 * 1000 // 5 minutes
};

const getCachedPosts = (cacheKey) => {
  if (postsCache[cacheKey] && postsCache[cacheKey].timestamp) {
    const age = Date.now() - postsCache[cacheKey].timestamp;
    if (age < postsCache.ttl) {
      return postsCache[cacheKey].data;
    }
  }
  return null;
};

const setCachedPosts = (cacheKey, data) => {
  postsCache[cacheKey] = {
    data: data,
    timestamp: Date.now()
  };
};

// ✅ API endpoint to get all posts with pagination support (OPTIMIZED)
app.get('/api/posts', async (req, res) => {
  try {
    // Parse query parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100; // Default to 100 for backward compatibility
    const status = req.query.status; // Optional: comma-separated status values (e.g., "posted,saved")
    
    // Build query filter
    const query = {};
    if (status) {
      const statusArray = status.split(',').map(s => s.trim());
      query.status = { $in: statusArray };
    }
    
    // Create cache key
    const cacheKey = `posts_${page}_${limit}_${status || 'all'}`;
    
    // Check cache first
    const cached = getCachedPosts(cacheKey);
    if (cached) {
      console.log('✅ Returning cached posts');
      return res.json(cached);
    }
    
    // Calculate pagination
    const skip = (page - 1) * limit;
    
    // Optimize: Use lean() for faster queries (returns plain JS objects)
    // Select only needed fields to reduce data transfer
    const postsQuery = Post.find(query)
      .select('_id content title platform status linkedinPostId uploadedImages uploadedVideo mediaUrl mediaType createdAt updatedAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(); // Use lean() for 2-3x faster queries
    
    // Execute query and count in parallel for better performance
    const [posts, total] = await Promise.all([
      postsQuery.exec(),
      Post.countDocuments(query).exec()
    ]);
    
    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    
    // Build response
    const response = {
      success: true,
      data: posts,
      pagination: {
        currentPage: page,
        perPage: limit,
        total: total,
        totalPages: totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
    
    // Cache the response (only cache small pages to avoid memory issues)
    if (limit <= 20) {
      setCachedPosts(cacheKey, response);
    }
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch posts',
      error: error.message
    });
  }
});


// ✅ Simple test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working!',
    timestamp: new Date().toISOString(),
    linkedinConfig: {
      hasAccessToken: !!LINKEDIN_CONFIG.accessToken
    }
  });
});

// ✅ API endpoint to upload image to Cloudinary
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    // Upload to Cloudinary using buffer
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'linkedin-posts',
        resource_type: 'image',
        transformation: [
          { quality: 'auto' },
          { fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return res.status(500).json({
            success: false,
            message: 'Failed to upload image to Cloudinary',
            error: error.message
          });
        }

        res.json({
          success: true,
          message: 'Image uploaded successfully',
          data: {
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            width: result.width,
            height: result.height,
            size: result.bytes
          }
        });
      }
    );

    // Convert buffer to stream and pipe to cloudinary
    const { Readable } = require('stream');
    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);
    bufferStream.pipe(uploadStream);

  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message
    });
  }
});

// ✅ API endpoint to upload image directly to LinkedIn
app.post('/api/upload-image-linkedin', upload.single('image'), async (req, res) => {
  try {
    console.log('📸 Image upload endpoint hit - uploading directly to LinkedIn');
    console.log('📁 Request file:', req.file ? {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      buffer: req.file.buffer ? `${req.file.buffer.length} bytes` : 'no buffer'
    } : 'No file');

    if (!req.file) {
      console.error('❌ No file in request');
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    if (!req.file.buffer) {
      console.error('❌ No buffer in file');
      return res.status(400).json({
        success: false,
        message: 'File buffer is missing'
      });
    }

    console.log('📸 Uploading image directly to LinkedIn:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    // Get user info to get the user ID
    const userInfo = await getLinkedInUserInfo();
    
    // Upload image directly to LinkedIn and get asset URN
    const imageBuffer = Buffer.from(req.file.buffer);
    const assetUrn = await uploadImageToLinkedIn(imageBuffer, userInfo);

    console.log('✅ Image uploaded successfully to LinkedIn');
    console.log('📦 Asset URN:', assetUrn);

    // Also upload to Cloudinary for website display
    console.log('📤 Also uploading to Cloudinary for website display...');
    const cloudinaryUrl = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'linkedin-posts',
          resource_type: 'image',
          transformation: [
            { quality: 'auto' },
            { fetch_format: 'auto' }
          ]
        },
        (error, result) => {
          if (error) {
            console.error('⚠️ Cloudinary upload error (non-fatal):', error.message);
            // Don't fail the request if Cloudinary fails, just log it
            resolve(null);
          } else {
            console.log('✅ Image also uploaded to Cloudinary:', result.secure_url);
            resolve(result.secure_url);
          }
        }
      );

      // Convert buffer to stream and pipe to cloudinary
      const { Readable } = require('stream');
      const bufferStream = new Readable();
      bufferStream.push(imageBuffer);
      bufferStream.push(null);
      bufferStream.pipe(uploadStream);
    });

    // Return both asset URN (for LinkedIn) and Cloudinary URL (for website)
    res.json({
      success: true,
      message: 'Image uploaded successfully to LinkedIn',
      data: {
        assetUrn: assetUrn, // For LinkedIn posting
        url: cloudinaryUrl, // For website display (null if Cloudinary upload failed)
        size: req.file.size,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname
      }
    });

  } catch (error) {
    console.error('❌ Error uploading image to LinkedIn:', error);
    // Make sure we haven't already sent a response
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to upload image to LinkedIn',
        error: error.message
      });
    }
  }
});

// ✅ API endpoint to upload video directly to LinkedIn
app.post('/api/upload-video', (req, res, next) => {
  uploadVideo.single('video')(req, res, (err) => {
    if (err) {
      console.error('❌ Multer error:', err.message);
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload error'
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    console.log('📹 Video upload endpoint hit - uploading directly to LinkedIn');
    console.log('📁 Request file:', req.file ? {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      buffer: req.file.buffer ? `${req.file.buffer.length} bytes` : 'no buffer'
    } : 'No file');

    if (!req.file) {
      console.error('❌ No file in request');
      return res.status(400).json({
        success: false,
        message: 'No video file provided'
      });
    }

    if (!req.file.buffer) {
      console.error('❌ No buffer in file');
      return res.status(400).json({
        success: false,
        message: 'File buffer is missing'
      });
    }

    console.log('📹 Uploading video directly to LinkedIn:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    // Get user info to get the user ID
    const userInfo = await getLinkedInUserInfo();
    
    // Upload video directly to LinkedIn and get asset URN
    const videoBuffer = Buffer.from(req.file.buffer);
    const assetUrn = await uploadVideoToLinkedIn(videoBuffer, userInfo);

    console.log('✅ Video uploaded successfully to LinkedIn');
    console.log('📦 Asset URN:', assetUrn);

    // Also upload to Cloudinary for website display
    console.log('📤 Also uploading to Cloudinary for website display...');
    const cloudinaryUrl = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'linkedin-posts',
          resource_type: 'video',
          transformation: [
            { quality: 'auto' },
            { fetch_format: 'auto' }
          ]
        },
        (error, result) => {
          if (error) {
            console.error('⚠️ Cloudinary upload error (non-fatal):', error.message);
            // Don't fail the request if Cloudinary fails, just log it
            resolve(null);
          } else {
            console.log('✅ Video also uploaded to Cloudinary:', result.secure_url);
            resolve(result.secure_url);
          }
        }
      );

      // Convert buffer to stream and pipe to cloudinary
      const { Readable } = require('stream');
      const bufferStream = new Readable();
      bufferStream.push(videoBuffer);
      bufferStream.push(null);
      bufferStream.pipe(uploadStream);
    });

    // Return both asset URN (for LinkedIn) and Cloudinary URL (for website)
    res.json({
      success: true,
      message: 'Video uploaded successfully to LinkedIn',
      data: {
        assetUrn: assetUrn, // For LinkedIn posting
        url: cloudinaryUrl, // For website display (null if Cloudinary upload failed)
        size: req.file.size,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname
      }
    });

  } catch (error) {
    console.error('❌ Error uploading video to LinkedIn:', error);
    // Make sure we haven't already sent a response
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to upload video to LinkedIn',
        error: error.message
      });
    }
  }
});

// ✅ API endpoint to get LinkedIn user info
app.get('/api/linkedin-userinfo', async (req, res) => {
  try {
    const userInfo = await getLinkedInUserInfo();
    res.json({
      success: true,
      data: userInfo
    });
  } catch (error) {
    console.error('Error fetching LinkedIn user info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch LinkedIn user info',
      error: error.response?.data || error.message
    });
  }
});

// ✅ API endpoint to post to LinkedIn
app.post('/api/post-to-linkedin', async (req, res) => {
  try {
    const { 
      content, 
      title = '', 
      mediaType = 'NONE', 
      mediaUrl = '', 
      mediaTitle = '', 
      mediaDescription = '', 
      mediaThumbnail = '',
      uploadedImages = [],
      uploadedVideo = '',
      uploadedVideoThumbnail = '',
      uploadedImageAssetUrns = [], // Asset URNs for images uploaded directly to LinkedIn
      postToLinkedIn: shouldPostToLinkedIn = true
    } = req.body;

    console.log('📝 Received LinkedIn post request:', { 
      content: content.substring(0, 50) + '...', 
      title, 
      mediaType,
      mediaUrl,
      uploadedImages: uploadedImages.length,
      uploadedVideo: uploadedVideo ? 'present' : 'none',
      uploadedVideoThumbnail: uploadedVideoThumbnail ? 'present' : 'none',
      postToLinkedIn: shouldPostToLinkedIn
    });

    // Validate required fields
    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Content is required'
      });
    }

    // Create post record in database
    const newPost = new Post({
      platform: 'linkedin',
      content: content,
      title: title,
      mediaType: mediaType,
      mediaUrl: mediaUrl,
      mediaTitle: mediaTitle,
      mediaDescription: mediaDescription,
      mediaThumbnail: mediaThumbnail,
      uploadedImages: uploadedImages,
      uploadedVideo: uploadedVideo,
      uploadedVideoThumbnail: uploadedVideoThumbnail,
      postToLinkedIn: shouldPostToLinkedIn,
      status: shouldPostToLinkedIn ? 'pending' : 'saved'
    });

    await newPost.save();
    console.log('💾 Post saved to database with ID:', newPost._id);

    // Check if user wants to post to LinkedIn
    if (!shouldPostToLinkedIn) {
      console.log('📥 Post saved without posting to LinkedIn (user preference)');
      return res.json({
        success: true,
        message: 'Post saved successfully without posting to LinkedIn',
        data: {
          postId: newPost._id,
          content: content,
          status: 'saved',
          uploadedImages: uploadedImages
        }
      });
    }

    try {
      // Post to LinkedIn
      console.log('🚀 Attempting to post to LinkedIn...');
      
      // Determine the actual media type and URL
      let effectiveMediaType = mediaType;
      let effectiveMediaUrl = mediaUrl;
      let effectiveMediaThumbnail = mediaThumbnail;
      let uploadedVideoAssetUrn = null;
      let uploadedImageAssetUrns = [];
      
      // If we have an uploaded video, it should be an asset URN (not a URL)
      // Check if uploadedVideo is an asset URN (starts with urn:li:digitalmediaAsset:)
      if (uploadedVideo) {
        if (uploadedVideo.startsWith('urn:li:digitalmediaAsset:')) {
          // It's already an asset URN from direct LinkedIn upload
          effectiveMediaType = 'VIDEO';
          uploadedVideoAssetUrn = uploadedVideo;
          effectiveMediaThumbnail = uploadedVideoThumbnail || mediaThumbnail;
          console.log('📹 Using uploaded video asset URN for LinkedIn post');
        } else {
          // Legacy: It's a URL (shouldn't happen with new flow, but handle gracefully)
          console.warn('⚠️ Uploaded video is a URL, not an asset URN. This should not happen with direct LinkedIn upload.');
          effectiveMediaType = 'VIDEO';
          effectiveMediaUrl = uploadedVideo;
          effectiveMediaThumbnail = uploadedVideoThumbnail || mediaThumbnail;
        }
      }
      
      // Check if we have asset URNs provided separately (from direct LinkedIn upload)
      if (uploadedImageAssetUrns && uploadedImageAssetUrns.length > 0) {
        // We have images uploaded directly to LinkedIn with asset URNs
        effectiveMediaType = 'IMAGE';
        uploadedImageAssetUrns = uploadedImageAssetUrns;
        console.log(`📸 Using ${uploadedImageAssetUrns.length} uploaded image asset URN(s) for LinkedIn post`);
      }
      // Otherwise, check if uploadedImages contain asset URNs (legacy support)
      else if (uploadedImages && uploadedImages.length > 0) {
        const imageAssetUrns = [];
        const imageUrls = [];
        
        for (let i = 0; i < uploadedImages.length; i++) {
          if (uploadedImages[i].startsWith('urn:li:digitalmediaAsset:')) {
            // It's an asset URN from direct LinkedIn upload
            imageAssetUrns.push(uploadedImages[i]);
          } else {
            // It's a URL (from Cloudinary)
            imageUrls.push(uploadedImages[i]);
          }
        }
        
        if (imageAssetUrns.length > 0) {
          // We have images uploaded directly to LinkedIn
          effectiveMediaType = 'IMAGE';
          uploadedImageAssetUrns = imageAssetUrns;
          console.log(`📸 Using ${imageAssetUrns.length} uploaded image asset URN(s) for LinkedIn post`);
        }
      }
      
      const linkedinResponse = await postToLinkedIn(content, {
        title,
        mediaType: effectiveMediaType,
        mediaUrl: effectiveMediaUrl,
        mediaTitle,
        mediaDescription,
        mediaThumbnail: effectiveMediaThumbnail,
        uploadedImages: uploadedImages, // Keep for legacy support
        uploadedVideoAssetUrn: uploadedVideoAssetUrn,
        uploadedImageAssetUrns: uploadedImageAssetUrns.length > 0 ? uploadedImageAssetUrns : undefined
      });
      
      // Update post record with LinkedIn post ID and user ID
      newPost.linkedinPostId = linkedinResponse.id;
      newPost.linkedinUserId = linkedinResponse.userInfo.sub;
      newPost.status = 'posted';
      await newPost.save();

      console.log('✅ Successfully posted to LinkedIn! Post ID:', linkedinResponse.id);

      res.json({
        success: true,
        message: 'Post successfully created and shared on LinkedIn',
        data: {
          postId: newPost._id,
          linkedinPostId: linkedinResponse.id,
          linkedinUserId: linkedinResponse.userInfo.sub,
          content: content,
          status: 'posted',
          uploadedImages: uploadedImages,
          userInfo: linkedinResponse.userInfo
        }
      });

    } catch (linkedinError) {
      // Update post status to failed
      newPost.status = 'failed';
      await newPost.save();

      console.error('❌ LinkedIn posting failed:');
      console.error('   - Error message:', linkedinError.message);
      console.error('   - Error stack:', linkedinError.stack);
      console.error('   - Status code:', linkedinError.response?.status);
      console.error('   - Response data:', JSON.stringify(linkedinError.response?.data, null, 2));
      console.error('   - Full error:', linkedinError);

      // Provide more helpful error messages
      let errorMessage = 'Failed to post to LinkedIn';
      if (linkedinError.response?.data) {
        if (typeof linkedinError.response.data === 'string') {
          errorMessage = linkedinError.response.data;
        } else if (linkedinError.response.data.message) {
          errorMessage = linkedinError.response.data.message;
        } else {
          errorMessage = JSON.stringify(linkedinError.response.data);
        }
      } else if (linkedinError.message) {
        errorMessage = linkedinError.message;
      }

      res.status(500).json({
        success: false,
        message: errorMessage,
        error: linkedinError.response?.data || linkedinError.message,
        postId: newPost._id
      });
    }

  } catch (error) {
    console.error('❌ Error in post-to-linkedin endpoint:');
    console.error('   - Error message:', error.message);
    console.error('   - Error stack:', error.stack);
    
    // Check if we already saved a post
    if (newPost && newPost._id) {
      try {
        newPost.status = 'failed';
        await newPost.save();
      } catch (saveError) {
        console.error('❌ Failed to update post status:', saveError);
      }
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
      error: error.message
    });
  }
});

// ✅ API endpoint to save post without posting to LinkedIn
app.post('/api/save-post', async (req, res) => {
  try {
    const { 
      content, 
      title = '', 
      mediaType = 'NONE', 
      mediaUrl = '', 
      mediaTitle = '', 
      mediaDescription = '', 
      mediaThumbnail = '',
      uploadedImages = [],
      uploadedVideo = '',
      uploadedVideoThumbnail = ''
    } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Content is required'
      });
    }

    const newPost = new Post({
      platform: 'linkedin',
      content: content,
      title: title,
      mediaType: mediaType,
      mediaUrl: mediaUrl,
      mediaTitle: mediaTitle,
      mediaDescription: mediaDescription,
      mediaThumbnail: mediaThumbnail,
      uploadedImages: uploadedImages,
      uploadedVideo: uploadedVideo,
      uploadedVideoThumbnail: uploadedVideoThumbnail,
      postToLinkedIn: false,
      status: 'saved'
    });

    await newPost.save();

    res.json({
      success: true,
      message: 'Post saved to database successfully',
      data: {
        postId: newPost._id,
        content: content,
        uploadedImages: uploadedImages,
        uploadedVideo: uploadedVideo,
        uploadedVideoThumbnail: uploadedVideoThumbnail,
        status: 'saved'
      }
    });

  } catch (error) {
    console.error('Error saving post:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save post',
      error: error.message
    });
  }
});

// ===== REVIEWS API ENDPOINTS =====

// ✅ Get all active reviews
app.get('/api/reviews', async (req, res) => {
  try {
    const reviews = await Review.find({ isActive: true }).sort({ order: 1, createdAt: -1 });
    res.json({
      success: true,
      data: reviews
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews',
      error: error.message
    });
  }
});

// ✅ Get all reviews (including inactive - for admin)
app.get('/api/reviews/all', async (req, res) => {
  try {
    const reviews = await Review.find().sort({ order: 1, createdAt: -1 });
    res.json({
      success: true,
      data: reviews
    });
  } catch (error) {
    console.error('Error fetching all reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews',
      error: error.message
    });
  }
});

// ✅ Create a new review
app.post('/api/reviews', async (req, res) => {
  try {
    const { name, role, content, type, mediaUrl, imageUrl, order, isActive } = req.body;

    // Validate required fields
    if (!name || !role || !content || !type) {
      return res.status(400).json({
        success: false,
        message: 'Name, role, content, and type are required'
      });
    }

    // Validate type
    if (!['text', 'image', 'video'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Type must be text, image, or video'
      });
    }

    const newReview = new Review({
      name,
      role,
      content,
      type,
      mediaUrl,
      imageUrl,
      order: order || 0,
      isActive: isActive !== undefined ? isActive : true
    });

    await newReview.save();
    console.log('✅ Review created:', newReview._id);

    res.json({
      success: true,
      message: 'Review created successfully',
      data: newReview
    });
  } catch (error) {
    console.error('Error creating review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create review',
      error: error.message
    });
  }
});

// ✅ Update a review
app.put('/api/reviews/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, content, type, mediaUrl, imageUrl, order, isActive } = req.body;

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Update fields
    if (name !== undefined) review.name = name;
    if (role !== undefined) review.role = role;
    if (content !== undefined) review.content = content;
    if (type !== undefined) {
      if (!['text', 'image', 'video'].includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Type must be text, image, or video'
        });
      }
      review.type = type;
    }
    if (mediaUrl !== undefined) review.mediaUrl = mediaUrl;
    if (imageUrl !== undefined) review.imageUrl = imageUrl;
    if (order !== undefined) review.order = order;
    if (isActive !== undefined) review.isActive = isActive;

    await review.save();
    console.log('✅ Review updated:', review._id);

    res.json({
      success: true,
      message: 'Review updated successfully',
      data: review
    });
  } catch (error) {
    console.error('Error updating review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update review',
      error: error.message
    });
  }
});

// ✅ Delete a review
app.delete('/api/reviews/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findByIdAndDelete(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    console.log('✅ Review deleted:', id);

    res.json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete review',
      error: error.message
    });
  }
});

// ✅ Toggle review active status
app.patch('/api/reviews/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    review.isActive = !review.isActive;
    await review.save();

    console.log('✅ Review status toggled:', id, '- isActive:', review.isActive);

    res.json({
      success: true,
      message: 'Review status updated successfully',
      data: review
    });
  } catch (error) {
    console.error('Error toggling review status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle review status',
      error: error.message
    });
  }
});

// ===== TEAM MEMBERS API ENDPOINTS =====

// ✅ Get all active team members
app.get('/api/team-members', async (req, res) => {
  try {
    const teamMembers = await TeamMember.find({ isActive: true }).sort({ order: 1, createdAt: -1 });
    res.json({
      success: true,
      data: teamMembers
    });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch team members',
      error: error.message
    });
  }
});

// ✅ Get all team members (including inactive - for admin)
app.get('/api/team-members/all', async (req, res) => {
  try {
    const teamMembers = await TeamMember.find().sort({ order: 1, createdAt: -1 });
    res.json({
      success: true,
      data: teamMembers
    });
  } catch (error) {
    console.error('Error fetching all team members:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch team members',
      error: error.message
    });
  }
});

// ✅ Create a new team member
app.post('/api/team-members', async (req, res) => {
  try {
    const { name, title, experience, image, order, isActive } = req.body;

    // Validate required fields
    if (!name || !title || !experience || !image) {
      return res.status(400).json({
        success: false,
        message: 'Name, title, experience, and image are required'
      });
    }

    const newTeamMember = new TeamMember({
      name,
      title,
      experience,
      image,
      order: order || 0,
      isActive: isActive !== undefined ? isActive : true
    });

    await newTeamMember.save();
    console.log('✅ Team member created:', newTeamMember._id);

    res.json({
      success: true,
      message: 'Team member created successfully',
      data: newTeamMember
    });
  } catch (error) {
    console.error('Error creating team member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create team member',
      error: error.message
    });
  }
});

// ✅ Update a team member
app.put('/api/team-members/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, title, experience, image, order, isActive } = req.body;

    const teamMember = await TeamMember.findById(id);
    if (!teamMember) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    // Update fields
    if (name !== undefined) teamMember.name = name;
    if (title !== undefined) teamMember.title = title;
    if (experience !== undefined) teamMember.experience = experience;
    if (image !== undefined) teamMember.image = image;
    if (order !== undefined) teamMember.order = order;
    if (isActive !== undefined) teamMember.isActive = isActive;

    await teamMember.save();
    console.log('✅ Team member updated:', teamMember._id);

    res.json({
      success: true,
      message: 'Team member updated successfully',
      data: teamMember
    });
  } catch (error) {
    console.error('Error updating team member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update team member',
      error: error.message
    });
  }
});

// ✅ Delete a team member
app.delete('/api/team-members/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const teamMember = await TeamMember.findByIdAndDelete(id);
    if (!teamMember) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    console.log('✅ Team member deleted:', id);

    res.json({
      success: true,
      message: 'Team member deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting team member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete team member',
      error: error.message
    });
  }
});

// ✅ Toggle team member active status
app.patch('/api/team-members/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;

    const teamMember = await TeamMember.findById(id);
    if (!teamMember) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    teamMember.isActive = !teamMember.isActive;
    await teamMember.save();

    console.log('✅ Team member status toggled:', id, '- isActive:', teamMember.isActive);

    res.json({
      success: true,
      message: 'Team member status updated successfully',
      data: teamMember
    });
  } catch (error) {
    console.error('Error toggling team member status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle team member status',
      error: error.message
    });
  }
});

// ✅ Connect to MongoDB & Start server
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('Connected to MongoDB');
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
})
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});
