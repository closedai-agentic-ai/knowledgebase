/**
 * Code Analyzer for AutoTutor (Node.js)
 * AWS Bedrock integration for code analysis
 */

const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");

class CodeAnalyzer {
  constructor(
    region = "us-west-2",
    modelId = "anthropic.claude-3-sonnet-20240229-v1:0"
  ) {
    this.client = new BedrockRuntimeClient({ region });
    this.modelId = modelId;
  }

  async _generateMarkdownTutorialFromLLM(data) {
    const prompt = `
    Generate a complete, professional-grade md for a mobile application repository based on the JSON specification provided below. The output must be in valid and clean Markdown format, well-structured using clear headings, subheadings, and bullet points. The tone should be informative and concise, appropriate for developers, contributors, and automated systems (e.g., LLMs) parsing documentation.

Instructions:
Include All Relevant Information
Convert all data from the JSON into human-readable documentation. Do not omit any section, even if only briefly mentioned. Preserve hierarchical relationships and logic between components.

JSON Data to be used:
${JSON.stringify(data, null, 2)}

Use This Structure in the Markdown:

# Project Title & Repository Info
Include repository name, owner, GitHub URL, apk_name, android.package, and generation date

## Overview
Purpose, target audience, architecture type, complexity level with explanation, and brief intro to core functionality.

## Features & User Flows
List and describe each user flow (task_creation, task_completion, task_deletion, bulk_clear) using headings and bullet points for user actions.


## Application Architecture & File Structure

Mention entry points and file count

List programming languages used

Present the full visual file structure as a code block

Include a short explanation of the directory organization

## Key Components Explained
For each component, explain:

Name & file

Type (e.g., function, store, object)

What it does

Why it’s important

How it works

Inputs & outputs

## Data Flow Descriptions
For each process (Task Creation, Toggle, Deletion), describe step-by-step logic from UI interaction to state update.

## Setup & Installation Guide
Include all prerequisites, installation commands, and how to run the app on different platforms using Expo CLI. Use bullet points and code blocks where appropriate.

## Setup & Runtime Flow Explanation
Describe each technical flow (initial setup, development server, runtime, platform-specific setup) as clearly labeled subsections.

Output Requirements:

The entire output should be a valid md.

Use clear formatting: headings (#, ##, ###), bullet points, and code blocks where relevant.

Optimize for readability, clarity, and parseability by language models.

Avoid repetition and unnecessary verbosity.
`;
    const response = await this._invokeBedrock(prompt);
    return {
      markdown: response,
      data: data,
    };
  }

  async analyzeFullRepository(
    repoInfo,
    fileStructure,
    mainFiles,
    fileContents
  ) {
    try {
      console.log("🧠 Starting repository analysis...");

      const [overview, relationships, components, setup] = await Promise.all([
        this._analyzeOverview(repoInfo, fileStructure, fileContents),
        this._analyzeRelationships(mainFiles, fileContents),
        this._analyzeComponents(fileContents),
        this._analyzeSetup(repoInfo, fileContents),
      ]);

      return {
        overview,
        relationships,
        components,
        setup,
        metadata: {
          analyzed_at: new Date().toISOString(),
          model_used: this.modelId,
          files_analyzed: Object.keys(fileContents).length,
        },
      };
    } catch (error) {
      throw new Error(`Analysis failed: ${error.message}`);
    }
  }

  async _analyzeOverview(repoInfo, fileStructure, fileContents) {
    const prompt = `Analyze the following software repository in depth and respond in a structured JSON format. Your analysis should be based on the code files, project configuration, and any manifest-like content (especially app.json) provided. Specifically, determine the name of the APK from the app.json file if applicable (e.g., if it's an Expo or React Native app).
Your response must include the following keys with clearly written and well-explained content:
purpose – Describe the overall purpose and primary functionality of the application. Explain what the app is about, the problems it solves, and what features it includes. Be thorough and specific.
technology_stack – List the technologies, frameworks, and programming languages used in the project.
architecture_type – Define the type of software architecture (e.g., web application, mobile application, command-line tool, software library, etc.).
target_audience – Identify who the application is meant for (e.g., developers, general users, system administrators, etc.).
complexity_level – Classify the project as beginner, intermediate, or advanced in terms of development complexity.
complexity_reasoning – Provide reasoning for the chosen complexity level, based on the code structure, use of libraries, patterns, and feature implementation.
apk_name – If available, extract the name of the APK or application from app.json (e.g., from expo.name or expo.slug).
flows – For each major feature in the application, provide the following:

Feature name
Description of the feature’s functionality
Step-by-step breakdown of the user or system flow through this feature (minimum 4 lines of explanation per feature)
Specific actions and interactions that occur in the flow, including UI or backend processes if applicable

Repository metadata:
Repository name: ${repoInfo.name}
Total files: ${fileStructure.total_files}
Languages used: ${Object.keys(fileStructure.languages).join(", ")}
apk_name: 
android.package 

Key file content (partial excerpts):
${Object.entries(fileContents)
  .slice(0, 3)
  .map(([path, content]) => `${path}:\n${content.substring(0, 1000)}`)
  .join("\n\n")}
Make sure your analysis is comprehensive, accurate, and structured for clarity. Respond only in the required JSON format.
`;

    const response = await this._invokeBedrock(prompt);
    return this._parseJsonResponse(response);
  }

  async _analyzeRelationships(mainFiles, fileContents) {
    const prompt = `Analyze the following set of files to understand the structure, behavior, and interactions within the application. Based on the content provided, perform the following tasks:

Identify Entry Points
Determine the main file(s) that initiate the execution of the application. These are typically the starting points for program flow (e.g., where main functions or root-level logic exist).

Extract Key Components
Identify and list the significant modules, classes, or functions that are central to the application's functionality. For each, briefly explain its purpose and role in the broader system.

Describe Data Flow (Be Descriptive – Minimum 10 Lines)
Analyze how data moves throughout the application:

What are the data sources (e.g., user input, API calls, files)?

How is data processed or transformed?

What intermediate structures or services are involved?

What outputs or side effects result from these flows?
Be specific about the types of data (e.g., strings, objects, JSON, database records), their transformations, and the flow direction. Your description should be at least 10 lines long and focus on the actual data content and behavior, not just the control flow.

Map File Dependencies
Determine how the files interact with each other. Identify direct and indirect dependencies, including file imports, shared utilities, or cross-module references.

Files to analyze:
${Object.entries(fileContents)
  .map(([path, content]) => `${path}:\n${content.substring(0, 800)}`)
  .join("\n\n")}

Response format:
Return a structured JSON object with the following keys:
{
  "entry_points": [/* list of entry point file paths */],
  "key_components": [/* list of important modules/classes/functions and their roles */],
  "data_flow": [/* detailed description of data flow steps and data types */],
  "dependencies": {
    /* file paths as keys and arrays of dependent file paths as values */
  }
}`;

    const response = await this._invokeBedrock(prompt);
    return this._parseJsonResponse(response);
  }

  async _analyzeComponents(fileContents) {
    const prompt = `I want you to perform a comprehensive technical analysis of the codebase provided below. Your task is to identify and describe the key components (functions, classes, modules, etc.) found in the code snippets. For each component, provide a detailed breakdown with the following attributes:

Name – The exact name of the component (e.g., UserService, handleSubmit, AppModule, etc.).

Type – Specify the kind of component it is (e.g., function, class, module, hook, middleware, etc.).

File – The file path where the component is defined (e.g., src/components/Button.js).

What – Describe what the component does, including its core logic, key behaviors, side effects, or any relevant algorithms. Be specific.

Why – Explain why this component is important to the overall application. Include how it contributes to the functionality, user experience, or system architecture.

How – Describe how this component works within the application. Include its interactions with other components, the flow of data or events through it, and lifecycle or execution order if relevant.

Inputs – List the expected inputs for the component. Include parameters, props, arguments, or external dependencies.

Outputs – List the expected outputs. Include return values, rendered UI, emitted events, side effects, or data transformations.

Testing Strategy – Briefly suggest how this component should be tested. Mention the most important test cases and whether unit, integration, or end-to-end testing applies.


Analyze only the components found in the following codebase snippet:
:
${Object.entries(fileContents)
  .slice(0, 5)
  .map(([path, content]) => `${path}:\n${content.substring(0, 1200)}`)
  .join("\n\n")}

The analysis should be returned in JSON format using the following schema:
{
  "components": [
    {
      "name": "string",
      "type": "string",
      "file": "string",
      "what": "string",
      "why": "string",
      "how": "string",
      "inputs": "string",
      "outputs": "string",
      "testingStrategy": "string"
    }
  ]
}
`;

    const response = await this._invokeBedrock(prompt);
    return this._parseJsonResponse(response);
  }

  async _analyzeSetup(repoInfo, fileContents) {
    const prompt = `You are provided with a software repository named ${
      repoInfo.name
    }. The goal is to deeply analyze its runtime and installation setup. Focus on the files most commonly used to manage dependencies, define installation requirements, and explain how to run the application. These include package.json, requirements.txt, readme.md, and setup.py.

Your analysis should be structured and comprehensive. Review the contents of these files (only excerpts provided) and extract the relevant technical details to explain:

Prerequisites:
Detail the environmental or platform-specific requirements needed before setting up or running the application. This might include programming language versions (e.g., Python 3.10, Node.js 18+), system-level dependencies, package managers (e.g., npm, pip), or tools (e.g., Docker, virtualenv).

Running Instructions:
Provide step-by-step instructions on how to install dependencies and run the application. Include any commands (e.g., npm install, pip install -r requirements.txt, npm run start, etc.), setup scripts, or configuration steps described in the provided files.

Setup Flow:
Break down the application's setup or runtime initialization flow. Identify key actions or scripts executed during the installation or runtime setup phase. Be specific—mention what files are executed, what configuration files are used, what modules or scripts are initialized, and what environment variables are required.
Repository: ${repoInfo.name}
Use only the contents of these files:
${Object.entries(fileContents)
  .filter(([path]) =>
    ["package.json", "requirements.txt", "readme.md", "setup.py"].some((f) =>
      path.toLowerCase().includes(f)
    )
  )
  .map(([path, content]) => `${path}:\n${content.substring(0, 1000)}`)
  .join("\n\n")}

Return your response in JSON format with the following top-level keys: prerequisites,running_instructions,flows

Each section should be as detailed as possible, accurate to the content in the files, and tailored to the specific setup logic of the application.
`;

    const response = await this._invokeBedrock(prompt);
    return this._parseJsonResponse(response);
  }

  async _invokeBedrock(prompt) {
    try {
      const body = JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const command = new InvokeModelCommand({
        modelId: this.modelId,
        body,
        contentType: "application/json",
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      return responseBody.content[0].text;
    } catch (error) {
      console.log(error);
      throw new Error(`Bedrock invocation failed: ${error.message}`);
    }
  }

  _parseJsonResponse(response) {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback: create basic structure
      return {
        error: "Could not parse response",
        raw_response: response.substring(0, 500),
      };
    } catch (error) {
      return {
        error: "JSON parse error",
        raw_response: response.substring(0, 500),
      };
    }
  }
}

module.exports = { CodeAnalyzer };
