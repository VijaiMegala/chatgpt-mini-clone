# ChatGPT Clone

A full-featured ChatGPT clone built with Next.js, MongoDB, Clerk authentication, and AI integration.

## Features

- 🎨 **Exact ChatGPT UI** - Replicated layout, spacing, fonts, animations, and scrolling behavior
- 📱 **Mobile Responsive** - Full mobile responsiveness with accessibility compliance
- ✏️ **Edit Messages** - Edit previously submitted messages with seamless regeneration
- 🤖 **AI Integration** - OpenRouter with multiple free models (DeepSeek, Qwen, Gemini, etc.)
- 🧠 **Memory System** - Mem0 integration for conversation memory and context
- 💾 **Database** - MongoDB with Mongoose for data persistence
- 🔐 **Authentication** - Clerk for secure user authentication
- 📁 **File Uploads** - Uploadcare for uploads, Cloudinary for storage and delivery
- 🔍 **File Analysis** - Automatic content analysis for AI responses
- 📥 **Download Files** - Download attached files from chat messages
- 🎯 **Context Management** - Smart context window handling for limited context models
- ⚡ **Streaming** - Real-time message streaming with graceful UI updates

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: TailwindCSS, ShadCN UI
- **Authentication**: Clerk
- **Database**: MongoDB with Mongoose
- **AI**: OpenRouter (DeepSeek, Qwen, Gemini, Llama, etc.)
- **Memory**: Mem0
- **File Storage**: Cloudinary, Uploadcare
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+ 
- MongoDB Atlas account
- OpenRouter API key
- Clerk account
- Cloudinary account
- Uploadcare account
- Mem0 account

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd chatgpt-clone
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   **Quick Setup:**
   ```bash
   ./setup-env.sh
   ```
   
   **Manual Setup:**
   Copy the example environment file and fill in your values:
   ```bash
   cp env.example .env.local
   ```
   
   Then edit `.env.local` with your actual API keys:
   ```env
   # Clerk Authentication
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key_here
   CLERK_SECRET_KEY=sk_test_your_clerk_secret_key_here
   
   # MongoDB
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/chatgpt-clone
   
   # OpenRouter API (uses free models like DeepSeek, Qwen, Gemini)
   OPENROUTER_API_KEY=your-openrouter-api-key-here
   
   # Cloudinary (Optional)
   CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_API_SECRET=your_cloudinary_api_secret
   
   # Uploadcare (Optional)
   NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY=your_uploadcare_public_key_here
   UPLOADCARE_SECRET_KEY=your_uploadcare_secret_key_here
   
   # Mem0 (Optional)
   MEM0_API_KEY=your_mem0_api_key_here
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Get your API keys**
   
   **Required for basic functionality:**
   - **Clerk**: [https://dashboard.clerk.com/](https://dashboard.clerk.com/) - Create a new application
   - **MongoDB**: [https://cloud.mongodb.com/](https://cloud.mongodb.com/) - Create a free cluster
   - **OpenRouter**: [https://openrouter.ai/keys](https://openrouter.ai/keys) - Create an API key (free models available)
   
   **Optional but recommended:**
   - **Cloudinary**: [https://cloudinary.com/console](https://cloudinary.com/console) - For file storage
   - **Uploadcare**: [https://uploadcare.com/dashboard/](https://uploadcare.com/dashboard/) - For file uploads
   - **Mem0**: [https://mem0.ai/](https://mem0.ai/) - For advanced memory features

   **📁 For detailed file upload setup, see [FILE_UPLOAD_SETUP.md](./FILE_UPLOAD_SETUP.md)**  
   **🤖 For OpenRouter AI setup, see [OPENROUTER_SETUP.md](./OPENROUTER_SETUP.md)**

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Project Structure

```
chatgpt-clone/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   ├── chat/          # Chat API endpoints
│   │   └── conversations/ # Conversation management
│   ├── sign-in/           # Authentication pages
│   ├── sign-up/
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components
│   ├── ui/               # ShadCN UI components
│   ├── chat-interface.tsx # Main chat interface
│   ├── chat-message.tsx   # Message component
│   ├── chat-input.tsx     # Input component
│   └── sidebar.tsx        # Sidebar component
├── lib/                   # Utility libraries
│   ├── ai/               # AI integration
│   ├── db/               # Database models and connection
│   ├── memory/           # Memory management
│   └── utils.ts          # Utility functions
└── middleware.ts          # Clerk middleware
```

## Key Features Implementation

### 1. ChatGPT UI Replication
- Exact layout matching with sidebar, chat area, and input
- Proper spacing, typography, and color schemes
- Smooth animations and transitions
- Mobile-responsive design

### 2. Message Editing
- Edit user messages with inline editing
- Regenerate assistant responses
- Maintain conversation flow

### 3. AI Integration
- OpenRouter API for multiple model access
- Free models: DeepSeek, Qwen, Gemini, Llama, Mistral
- Automatic model fallback and error handling
- Context window management
- Streaming responses

### 4. Memory System
- Mem0 integration for conversation memory
- Context-aware responses
- Persistent memory across sessions

### 5. Database Management
- MongoDB with Mongoose ODM
- User and conversation models
- Message persistence and retrieval

### 6. File Upload System
- Uploadcare integration for file uploads
- Cloudinary for storage and delivery
- Automatic file content analysis
- Support for images, PDFs, and text files
- Download functionality for attached files
- File preview and optimization

## API Endpoints

- `POST /api/chat` - Send message and get AI response
- `GET /api/conversations` - Get user conversations
- `POST /api/conversations` - Create new conversation
- `GET /api/conversations/[id]` - Get specific conversation
- `PUT /api/conversations/[id]` - Update conversation
- `DELETE /api/conversations/[id]` - Delete conversation
- `POST /api/upload` - Upload files with analysis
- `DELETE /api/upload` - Delete uploaded files

## Deployment

### Vercel Deployment

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Deploy on Vercel**
   - Connect your GitHub repository to Vercel
   - Add environment variables in Vercel dashboard
   - Deploy automatically

### Environment Variables for Production

Make sure to set all environment variables in your Vercel dashboard:
- All the variables from `.env.local`
- Ensure MongoDB Atlas allows connections from Vercel IPs

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support, please open an issue in the GitHub repository.
