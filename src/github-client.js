/**
 * GitHub Client for AutoTutor (Node.js)
 * Handles GitHub repository operations
 */

const simpleGit = require("simple-git");
const fs = require("fs-extra");
const path = require("path");
const ignore = require("ignore");
const tmp = require("tmp");

class GitHubClient {
  constructor() {
    this.repoPath = null;
    this.git = null;
  }

  /**
   * Clone a GitHub repository
   * @param {string} githubUrl - GitHub repository URL
   * @returns {Promise<string>} Path to cloned repository
   */
  async cloneRepository(githubUrl) {
    try {
      // Create temporary directory
      const tmpDir = tmp.dirSync({ unsafeCleanup: true });
      this.repoPath = tmpDir.name;

      console.log(`📥 Cloning ${githubUrl} to ${this.repoPath}`);

      // Initialize git and clone
      this.git = simpleGit();
      await this.git.clone(githubUrl, this.repoPath, ["--depth", "1"]);

      console.log("✅ Repository cloned successfully");
      return this.repoPath;
    } catch (error) {
      throw new Error(`Failed to clone repository: ${error.message}`);
    }
  }

  /**
   * Extract repository owner and name from GitHub URL
   * @param {string} githubUrl - GitHub repository URL
   * @returns {Object} Object with owner and repoName
   */
  extractRepoInfo(githubUrl) {
    try {
      const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        throw new Error("Invalid GitHub URL format");
      }

      const owner = match[1];
      let repoName = match[2];

      // Remove .git suffix if present
      if (repoName.endsWith(".git")) {
        repoName = repoName.slice(0, -4);
      }

      return { owner, repoName };
    } catch (error) {
      throw new Error(`Failed to extract repo info: ${error.message}`);
    }
  }

  /**
   * Get file structure of the repository
   * @returns {Promise<Object>} File structure information
   */
  async getFileStructure() {
    if (!this.repoPath) {
      throw new Error("Repository not cloned yet");
    }

    try {
      const files = [];
      const languages = {};

      // Load gitignore patterns
      const ig = await this._loadGitignore();

      await this._walkDirectory(this.repoPath, "", files, languages, ig);

      return {
        total_files: files.length,
        languages,
        files: files.slice(0, 100), // Limit for Lambda
      };
    } catch (error) {
      throw new Error(`Failed to get file structure: ${error.message}`);
    }
  }

  /**
   * Get main files from the repository
   * @returns {Promise<Array>} Array of main file paths
   */
  async getMainFiles() {
    if (!this.repoPath) {
      throw new Error("Repository not cloned yet");
    }

    try {
      const files = [];
      const ig = await this._loadGitignore();

      await this._walkDirectory(this.repoPath, "", files, {}, ig);

      // Sort files by importance
      const sortedFiles = files
        .map((f) => f.path)
        .sort(
          (a, b) => this._getFileImportance(b) - this._getFileImportance(a)
        );

      return sortedFiles.slice(0, 20); // Top 20 files
    } catch (error) {
      throw new Error(`Failed to get main files: ${error.message}`);
    }
  }

  /**
   * Read content of a file
   * @param {string} filePath - Relative path to file
   * @param {number} maxSize - Maximum file size to read
   * @returns {Promise<string|null>} File content or null
   */
  async readFileContent(filePath, maxSize = 50000) {
    if (!this.repoPath) {
      throw new Error("Repository not cloned yet");
    }

    try {
      const fullPath = path.join(this.repoPath, filePath);

      // Check if file exists and is readable
      if (!(await fs.pathExists(fullPath))) {
        return null;
      }

      const stats = await fs.stat(fullPath);
      if (stats.size > maxSize) {
        console.log(
          `⚠️ File ${filePath} too large (${stats.size} bytes), skipping`
        );
        return null;
      }

      // Check if file is binary
      if (this._isBinaryFile(filePath)) {
        return null;
      }

      const content = await fs.readFile(fullPath, "utf8");
      return content;
    } catch (error) {
      console.log(`⚠️ Could not read file ${filePath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Cleanup temporary files
   */
  async cleanup() {
    if (this.repoPath) {
      try {
        await fs.remove(this.repoPath);
        console.log("🧹 Cleaned up temporary files");
      } catch (error) {
        console.warn("⚠️ Cleanup warning:", error.message);
      }
    }
  }

  /**
   * Load gitignore patterns
   * @returns {Promise<Object>} Ignore instance
   * @private
   */
  async _loadGitignore() {
    const ig = ignore();

    // Add default patterns
    ig.add([
      ".git",
      "node_modules",
      "__pycache__",
      "*.pyc",
      ".DS_Store",
      "*.log",
      "dist",
      "build",
    ]);

    try {
      const gitignorePath = path.join(this.repoPath, ".gitignore");
      if (await fs.pathExists(gitignorePath)) {
        const gitignoreContent = await fs.readFile(gitignorePath, "utf8");
        ig.add(gitignoreContent);
      }
    } catch (error) {
      // Ignore gitignore loading errors
    }

    return ig;
  }

  /**
   * Walk directory recursively
   * @param {string} dirPath - Directory path
   * @param {string} relativePath - Relative path from repo root
   * @param {Array} files - Files array to populate
   * @param {Object} languages - Languages object to populate
   * @param {Object} ig - Ignore instance
   * @private
   */
  async _walkDirectory(dirPath, relativePath, files, languages, ig) {
    try {
      const items = await fs.readdir(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const relativeItemPath = path.join(relativePath, item);

        // Check if should be ignored
        if (ig.ignores(relativeItemPath)) {
          continue;
        }

        const stats = await fs.stat(itemPath);

        if (stats.isDirectory()) {
          await this._walkDirectory(
            itemPath,
            relativeItemPath,
            files,
            languages,
            ig
          );
        } else if (stats.isFile()) {
          const ext = path.extname(item).toLowerCase();
          const language = this._getLanguageFromExtension(ext);

          if (language) {
            languages[language] = (languages[language] || 0) + 1;
          }

          files.push({
            name: item,
            path: relativeItemPath,
            directory: relativePath,
            size: stats.size,
            extension: ext,
          });
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  /**
   * Get file importance score
   * @param {string} filePath - File path
   * @returns {number} Importance score
   * @private
   */
  _getFileImportance(filePath) {
    const fileName = path.basename(filePath).toLowerCase();
    const ext = path.extname(filePath).toLowerCase();

    // High importance files
    if (["readme.md", "readme.txt", "readme"].includes(fileName)) return 100;
    if (["package.json", "requirements.txt", "setup.py"].includes(fileName))
      return 90;
    if (["index.js", "main.py", "app.py", "server.js"].includes(fileName))
      return 80;

    // By extension
    const extScores = {
      ".js": 70,
      ".py": 70,
      ".ts": 70,
      ".json": 60,
      ".yaml": 60,
      ".yml": 60,
      ".md": 50,
      ".txt": 40,
      ".html": 30,
      ".css": 20,
    };

    return extScores[ext] || 10;
  }

  /**
   * Get programming language from file extension
   * @param {string} ext - File extension
   * @returns {string|null} Language name
   * @private
   */
  _getLanguageFromExtension(ext) {
    const langMap = {
      ".js": "JavaScript",
      ".ts": "TypeScript",
      ".py": "Python",
      ".java": "Java",
      ".cpp": "C++",
      ".c": "C",
      ".cs": "C#",
      ".php": "PHP",
      ".rb": "Ruby",
      ".go": "Go",
      ".rs": "Rust",
      ".swift": "Swift",
      ".kt": "Kotlin",
      ".scala": "Scala",
      ".html": "HTML",
      ".css": "CSS",
      ".json": "JSON",
      ".xml": "XML",
      ".yaml": "YAML",
      ".yml": "YAML",
    };

    return langMap[ext] || null;
  }

  /**
   * Check if file is binary
   * @param {string} filePath - File path
   * @returns {boolean} True if binary
   * @private
   */
  _isBinaryFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const binaryExts = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".bmp",
      ".ico",
      ".pdf",
      ".zip",
      ".tar",
      ".gz",
      ".rar",
      ".exe",
      ".dll",
      ".so",
      ".dylib",
      ".mp3",
      ".mp4",
      ".avi",
      ".mov",
    ];

    return binaryExts.includes(ext);
  }
}

module.exports = { GitHubClient };
