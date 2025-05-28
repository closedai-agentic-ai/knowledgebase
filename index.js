/**
 * AWS Lambda Handler for AutoTutor (Node.js)
 */

const { GitHubClient } = require("./src/github-client");
const { CodeAnalyzer } = require("./src/code-analyzer");
const { TutorialGenerator } = require("./src/tutorial-generator");
const { S3Uploader } = require("./src/s3-uploader");

exports.handler = async (event, context) => {
  console.log("🚀 AutoTutor Lambda started (Node.js)");
  const startTime = Date.now();

  try {
    let data = event;
    if (event.body) {
      data = JSON.parse(event.body);
    }

    const {
      github_url,
      upload_to_s3 = true,
      aws_region = process.env.AWS_REGION || "us-west-2",
      s3_bucket = process.env.S3_BUCKET_NAME,
      bedrock_model = process.env.AWS_BEDROCK_MODEL_ID,
    } = data;

    if (!github_url) {
      return createErrorResponse(400, "Missing required parameter: github_url");
    }

    // Initialize components
    const githubClient = new GitHubClient();
    const codeAnalyzer = new CodeAnalyzer(aws_region, bedrock_model);
    const tutorialGenerator = new TutorialGenerator();

    let s3Uploader;
    if (upload_to_s3) {
      s3Uploader = new S3Uploader(s3_bucket, aws_region);
    }

    // Process repository
    console.log("📥 Cloning repository...");
    await githubClient.cloneRepository(github_url);
    const { owner, repoName } = githubClient.extractRepoInfo(github_url);

    const repoInfo = { owner, name: repoName, url: github_url };

    console.log("📁 Analyzing file structure...");
    const fileStructure = await githubClient.getFileStructure();
    const mainFiles = await githubClient.getMainFiles();

    console.log("📖 Reading file contents...");
    const fileContents = {};
    for (const filePath of mainFiles.slice(0, 50)) {
      const content = await githubClient.readFileContent(filePath, 50000);
      if (content) fileContents[filePath] = content;
    }

    console.log("🧠 Analyzing with AWS Bedrock...");
    const analysisResults = await codeAnalyzer.analyzeFullRepository(
      repoInfo,
      fileStructure,
      mainFiles,
      fileContents
    );

    const content = tutorialGenerator.generateTutorial(
      analysisResults,
      repoInfo,
      fileStructure
    );

    const tutorialContent = await codeAnalyzer._generateMarkdownTutorialFromLLM(
      content
    );
    const result = {
      repository: repoInfo,
      analysis: analysisResults,
      success: true,
    };

    if (upload_to_s3) {
      console.log("☁️ Uploading to S3...");
      const filePaths = await tutorialGenerator.saveTutorialFiles(
        tutorialContent,
        "/tmp",
        repoName
      );

      const uploadedUrls = await s3Uploader.uploadTutorialFiles(
        {
          markdown: filePaths.markdown,
          json: filePaths.json,
        },
        repoName
      );

      result.s3_urls = uploadedUrls;
      result.tutorial_url = uploadedUrls.markdown;
      result.data_url = uploadedUrls.json;
    } else {
      result.tutorial_content = {
        markdown: tutorialContent.markdown.substring(0, 10000),
        data: tutorialContent.data,
      };
    }

    result.execution_time = Math.round((Date.now() - startTime) / 10) / 100;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error("❌ Error:", error.message);
    return createErrorResponse(500, error.message, {
      execution_time: Math.round((Date.now() - startTime) / 10) / 100,
    });
  }
};

function createErrorResponse(statusCode, message, details = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      success: false,
      error: message,
      ...details,
    }),
  };
}
