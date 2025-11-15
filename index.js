const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

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
app.use(cors({
  origin: [
    'https://satocc-coral.vercel.app',
    'http://localhost:3000'
  ],
  credentials: true
}));
app.use(bodyParser.json());

// ✅ LinkedIn API Configuration
const LINKEDIN_CONFIG = {
  accessToken: 'AQW7XJBKTyD--kaCNFOIH9xEQkwXMLI5fH7NuSYAmQJOOMXgFawuXNToYnDBl98fZP1RUnNVjiq7MjH5t71X-29XZE2mBLsUeg9nPGMQtkLv-r-YK4HjMjVJSQQQtXDw-408GFRTdKDnvJ-lIm27Ry51-bGa6_5RtVsbnBi3d5ZiqgqCQd_oZI0OZqgtf9xXoAa4RNHTViZrt6yKEROSsHz62GZ3OimKpb09Utg55APCkBMC6Eo7HM6CrWlMyZJPAi25yLTaDsBDj3JnsAXg5gXb6Gf9fIK-V-XctGV6TikOEh4446aWUB8_ip17NFE5IO5E6EsdJvPjMT6caSOdKx7mMSkceA'
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
  uploadedVideo: { type: String },              // Cloudinary video URL
  uploadedVideoThumbnail: { type: String },     // Custom video thumbnail URL
  postToLinkedIn: { type: Boolean, default: true }, // Whether to post to LinkedIn or just save
  status: { type: String, default: 'pending' } // pending, posted, failed, saved
}, { timestamps: true });

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
  email: { type: String, required: true },
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

// Upload image to LinkedIn and get media URN
async function uploadImageToLinkedIn(imageUrl, userInfo) {
  try {
    console.log('📸 Uploading image to LinkedIn:', imageUrl);
    
    const personUrn = `urn:li:person:${userInfo.sub}`;
    
    // Step 1: Register the upload
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

    const uploadUrl = registerUploadResponse.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    const asset = registerUploadResponse.data.value.asset;

    console.log('✅ Upload registered. Asset URN:', asset);

    // Step 2: Download image from Cloudinary
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data);

    console.log('📥 Downloaded image from Cloudinary, size:', imageBuffer.length, 'bytes');

    // Step 3: Upload the image binary to LinkedIn
    await axios.put(uploadUrl, imageBuffer, {
      headers: {
        'Authorization': `Bearer ${LINKEDIN_CONFIG.accessToken}`,
        'Content-Type': 'application/octet-stream'
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    console.log('✅ Image uploaded to LinkedIn successfully');

    return asset; // Return the asset URN
  } catch (error) {
    console.error('❌ Error uploading image to LinkedIn:', error.response?.data || error.message);
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
    const effectiveMediaType = hasUploadedImages ? 'IMAGE' : mediaType;

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

    // Add uploaded images if available
    if (hasUploadedImages) {
      console.log(`🔄 Uploading ${uploadedImages.length} image(s) to LinkedIn...`);
      
      // Upload each image to LinkedIn and get media URNs
      const mediaUrns = [];
      for (let i = 0; i < uploadedImages.length; i++) {
        try {
          const assetUrn = await uploadImageToLinkedIn(uploadedImages[i], userInfo);
          mediaUrns.push(assetUrn);
          console.log(`✅ Image ${i + 1}/${uploadedImages.length} uploaded successfully`);
        } catch (uploadError) {
          console.error(`❌ Failed to upload image ${i + 1}:`, uploadError.message);
          throw new Error(`Failed to upload image ${i + 1} to LinkedIn: ${uploadError.message}`);
        }
      }

      // Use the media URNs in the post
      postData.specificContent['com.linkedin.ugc.ShareContent'].media = mediaUrns.map((assetUrn, index) => ({
        status: 'READY',
        description: {
          text: mediaDescription || content
        },
        media: assetUrn,
        title: {
          text: mediaTitle || title || `Image ${index + 1}`
        }
      }));
    }
    // Add media URL if provided (for ARTICLE or VIDEO)
    else if (mediaType !== 'NONE' && mediaUrl) {
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
    console.log('   - Post Data:', JSON.stringify(postData, null, 2));

    // Post to LinkedIn using the UGC Posts API
    const response = await axios.post('https://api.linkedin.com/v2/ugcPosts', postData, {
      headers: {
        'Authorization': `Bearer ${LINKEDIN_CONFIG.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });

    return {
      ...response.data,
      userInfo: userInfo
    };
  } catch (error) {
    console.error('Error posting to LinkedIn:', error.response?.data || error.message);
    throw error;
  }
}

// ✅ Google Apps Script Web App URL
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwX6sBx2LCfMH_fYgjmXoQY_sswvUptgOA-Jk8JT4rkXhMW6PjGbsqXQ70QlZ4Yf1Vh/exec';


// ✅ API endpoint to submit form data
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



// ✅ API endpoint to get all posts
app.get('/api/posts', async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: posts
    });
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

// ✅ API endpoint to upload video to Cloudinary
app.post('/api/upload-video', uploadVideo.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No video file provided'
      });
    }

    console.log('📹 Uploading video to Cloudinary:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    // Upload to Cloudinary using buffer
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
          console.error('Cloudinary video upload error:', error);
          return res.status(500).json({
            success: false,
            message: 'Failed to upload video to Cloudinary',
            error: error.message
          });
        }

        console.log('✅ Video uploaded successfully to Cloudinary:', result.secure_url);

        res.json({
          success: true,
          message: 'Video uploaded successfully',
          data: {
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            width: result.width,
            height: result.height,
            size: result.bytes,
            duration: result.duration
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
    console.error('Error uploading video:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload video',
      error: error.message
    });
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
      const linkedinResponse = await postToLinkedIn(content, {
        title,
        mediaType,
        mediaUrl: uploadedVideo || mediaUrl, // Use uploadedVideo if available, otherwise use mediaUrl
        mediaTitle,
        mediaDescription,
        mediaThumbnail: uploadedVideoThumbnail || mediaThumbnail, // Use uploadedVideoThumbnail if available
        uploadedImages
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

      console.error('❌ LinkedIn posting failed:', linkedinError.response?.data || linkedinError.message);

      res.status(500).json({
        success: false,
        message: 'Failed to post to LinkedIn',
        error: linkedinError.response?.data || linkedinError.message,
        postId: newPost._id
      });
    }

  } catch (error) {
    console.error('Error in post-to-linkedin endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
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
    const { name, title, email, experience, image, order, isActive } = req.body;

    // Validate required fields
    if (!name || !title || !email || !experience || !image) {
      return res.status(400).json({
        success: false,
        message: 'Name, title, email, experience, and image are required'
      });
    }

    const newTeamMember = new TeamMember({
      name,
      title,
      email,
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
    const { name, title, email, experience, image, order, isActive } = req.body;

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
    if (email !== undefined) teamMember.email = email;
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
