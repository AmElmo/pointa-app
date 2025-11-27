#!/bin/bash
# Quick Fix Checklist for Pointa Race Condition Issue

echo "🔍 POINTA SYSTEM CHECK"
echo "====================="
echo ""

echo "1️⃣ Checking if server is running on port 4242..."
if lsof -i :4242 > /dev/null 2>&1; then
  echo "   ✅ Server is running"
  lsof -i :4242 | grep LISTEN
else
  echo "   ❌ Server is NOT running"
  echo "   👉 Start it with: cd annotations-server && npm start"
fi
echo ""

echo "2️⃣ Testing server health endpoint..."
if curl -s -f http://127.0.0.1:4242/health > /dev/null 2>&1; then
  echo "   ✅ Server is responding"
  curl -s http://127.0.0.1:4242/health
else
  echo "   ❌ Server is not responding"
  echo "   👉 Check if server is running correctly"
fi
echo ""

echo "3️⃣ Checking annotation data directory..."
if [ -d ~/.pointa ]; then
  echo "   ✅ Data directory exists: ~/.pointa"
  echo "   📊 Files:"
  ls -lh ~/.pointa/
else
  echo "   ⚠️  Data directory doesn't exist yet"
  echo "   (Will be created when first annotation is saved)"
fi
echo ""

echo "4️⃣ Checking local server package version..."
cd "$(dirname "$0")/annotations-server"
VERSION=$(node -p "require('./package.json').version" 2>/dev/null)
if [ ! -z "$VERSION" ]; then
  echo "   ✅ Local server version: $VERSION"
else
  echo "   ❌ Could not read package.json"
fi
cd - > /dev/null
echo ""

echo "📋 NEXT STEPS:"
echo "=============="
echo ""
echo "✅ 1. RELOAD CHROME EXTENSION (CRITICAL!)"
echo "   - Go to: chrome://extensions/"
echo "   - Find 'Pointa' extension"
echo "   - Click 🔄 RELOAD button"
echo ""
echo "✅ 2. VERIFY FIX IS ACTIVE"
echo "   - Open DevTools (F12) on localhost page"
echo "   - Look for: [BG_MONITOR_START] Starting API connection monitoring (Option D: no polling)"
echo ""
echo "✅ 3. TEST ANNOTATIONS"
echo "   - Create 3-5 annotations quickly"
echo "   - All should stay visible"
echo "   - Check console for [SAVE_ANNOTATION_SUCCESS]"
echo ""
echo "⚠️  If server is not running above, start it with:"
echo "   cd $(dirname "$0")/annotations-server"
echo "   npm start"
echo ""



