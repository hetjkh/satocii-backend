// Test script for new LinkedIn API integration
const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000';

// Test data for simple text post
const testTextPost = {
  content: "🚀 Just launched a new feature on my website! Check out this amazing update that will revolutionize how users interact with our platform. #innovation #webdev #tech",
  title: "New Feature Launch"
};

// Test data for media post (article/video)
const testMediaPost = {
  content: "Understanding Proxy vs Reverse Proxy - A comprehensive guide for developers.",
  title: "Proxy Vs Reverse Proxy",
  mediaType: "ARTICLE",
  mediaUrl: "https://www.youtube.com/watch?v=DO9-mAwwegc&t=174s&ab_channel=TechSunami",
  mediaTitle: "Proxy Vs Reverse Proxy",
  mediaDescription: "Understanding Proxy vs Reverse Proxy.",
  mediaThumbnail: "https://i.ytimg.com/vi/DO9-mAwwegc/maxresdefault.jpg"
};

async function testLinkedInAPI() {
  try {
    console.log('🧪 Testing New LinkedIn API Integration...\n');

    // Test 1: Get LinkedIn User Info
    console.log('1. Testing LinkedIn User Info API...');
    try {
      const userInfoResponse = await axios.get(`${API_BASE_URL}/api/linkedin-userinfo`);
      console.log('✅ LinkedIn User Info:', userInfoResponse.data.data.name);
      console.log('   User ID (sub):', userInfoResponse.data.data.sub);
      console.log('   Email:', userInfoResponse.data.data.email);
    } catch (error) {
      console.log('❌ LinkedIn User Info Error:', error.response?.data?.message || error.message);
    }

    // Test 2: Post Simple Text to LinkedIn
    console.log('\n2. Testing Simple Text Post to LinkedIn...');
    try {
      const textPostResponse = await axios.post(`${API_BASE_URL}/api/post-to-linkedin`, testTextPost);
      console.log('✅ Text Post Created Successfully!');
      console.log('   Post ID:', textPostResponse.data.data.postId);
      console.log('   LinkedIn Post ID:', textPostResponse.data.data.linkedinPostId);
      console.log('   Status:', textPostResponse.data.data.status);
    } catch (error) {
      console.log('❌ Text Post Error:', error.response?.data?.message || error.message);
    }

    // Test 3: Post Media Content to LinkedIn
    console.log('\n3. Testing Media Post to LinkedIn...');
    try {
      const mediaPostResponse = await axios.post(`${API_BASE_URL}/api/post-to-linkedin`, testMediaPost);
      console.log('✅ Media Post Created Successfully!');
      console.log('   Post ID:', mediaPostResponse.data.data.postId);
      console.log('   LinkedIn Post ID:', mediaPostResponse.data.data.linkedinPostId);
      console.log('   Status:', mediaPostResponse.data.data.status);
      console.log('   Media Type:', testMediaPost.mediaType);
    } catch (error) {
      console.log('❌ Media Post Error:', error.response?.data?.message || error.message);
    }

    // Test 4: Save Post Without Posting
    console.log('\n4. Testing Save Post (without posting)...');
    try {
      const savePostResponse = await axios.post(`${API_BASE_URL}/api/save-post`, {
        content: "This is a draft post that will be saved but not posted to LinkedIn.",
        title: "Draft Post",
        mediaType: "NONE"
      });
      console.log('✅ Post Saved Successfully!');
      console.log('   Post ID:', savePostResponse.data.data.postId);
      console.log('   Status:', savePostResponse.data.data.status);
    } catch (error) {
      console.log('❌ Save Post Error:', error.response?.data?.message || error.message);
    }

    // Test 5: Get All Posts
    console.log('\n5. Testing Get Posts API...');
    try {
      const postsResponse = await axios.get(`${API_BASE_URL}/api/posts`);
      console.log('✅ Posts Retrieved Successfully!');
      console.log('   Total Posts:', postsResponse.data.data.length);
      postsResponse.data.data.forEach((post, index) => {
        console.log(`   Post ${index + 1}: ${post.status} - ${post.content.substring(0, 50)}...`);
        if (post.linkedinPostId) {
          console.log(`     LinkedIn Post ID: ${post.linkedinPostId}`);
        }
        if (post.mediaType !== 'NONE') {
          console.log(`     Media Type: ${post.mediaType}`);
        }
      });
    } catch (error) {
      console.log('❌ Get Posts Error:', error.response?.data?.message || error.message);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testLinkedInAPI();
