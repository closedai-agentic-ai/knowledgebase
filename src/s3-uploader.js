/**
 * S3 Uploader for AutoTutor (Node.js)
 * Simple S3 file uploader for tutorial files
 */

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs-extra");
const path = require("path");
const mime = require("mime-types");

class S3Uploader {
  constructor(bucketName, region = "us-west-2") {
    this.bucketName = bucketName || process.env.S3_BUCKET_NAME;
    this.region = region;

    if (!this.bucketName) {
      throw new Error(
        "S3 bucket name must be provided via parameter or S3_BUCKET_NAME environment variable"
      );
    }

    this.s3Client = new S3Client({ region: this.region });
  }

  async uploadTutorialFiles(filePaths, repoName) {
    try {
      const uploadedUrls = {};
      const baseKey = `${repoName}/${new Date().toISOString().split("T")[0]}`;

      for (const [fileType, localPath] of Object.entries(filePaths)) {
        if (!(await fs.pathExists(localPath))) {
          console.warn(`⚠️ File not found: ${localPath}`);
          continue;
        }

        const filename = path.basename(localPath);
        const s3Key = `${baseKey}/${filename}`;
        const contentType = this._getContentType(filename);

        console.log(`📤 Uploading ${filename}...`);

        const fileContent = await fs.readFile(localPath);

        const command = new PutObjectCommand({
          Bucket: this.bucketName,
          Key: s3Key,
          Body: fileContent,
          ContentType: contentType,
          CacheControl: "max-age=3600",
        });

        await this.s3Client.send(command);

        const publicUrl = this._getPublicUrl(s3Key);
        uploadedUrls[fileType] = publicUrl;

        console.log(`✅ Uploaded ${filename} -> ${publicUrl}`);
      }

      return uploadedUrls;
    } catch (error) {
      throw new Error(`Failed to upload files to S3: ${error.message}`);
    }
  }

  async uploadSingleFile(localPath, s3Key) {
    try {
      if (!(await fs.pathExists(localPath))) {
        throw new Error(`File not found: ${localPath}`);
      }

      const contentType = this._getContentType(path.basename(localPath));
      const fileContent = await fs.readFile(localPath);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: fileContent,
        ContentType: contentType,
      });

      await this.s3Client.send(command);

      return this._getPublicUrl(s3Key);
    } catch (error) {
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
  }

  _getContentType(filename) {
    const contentType = mime.lookup(filename);

    if (!contentType) {
      if (filename.endsWith(".md")) {
        return "text/markdown";
      } else if (filename.endsWith(".json")) {
        return "application/json";
      } else {
        return "application/octet-stream";
      }
    }

    return contentType;
  }

  _getPublicUrl(s3Key) {
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${s3Key}`;
  }
}

module.exports = { S3Uploader };
