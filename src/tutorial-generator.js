/**
 * Tutorial Generator for AutoTutor (Node.js)
 * Generates LLM-friendly Markdown tutorials
 */

const handlebars = require("handlebars");
const fs = require("fs-extra");
const path = require("path");

class TutorialGenerator {
  constructor() {
    this.setupHelpers();
  }

  generateTutorial(analysisResults, repoInfo, fileStructure) {
    try {
      const tutorialData = this._prepareTutorialData(
        analysisResults,
        repoInfo,
        fileStructure
      );
      return tutorialData;
    } catch (error) {
      throw new Error(`Tutorial generation failed: ${error.message}`);
    }
  }

  async saveTutorialFiles(tutorialContent, outputDir, repoName) {
    try {
      await fs.ensureDir(outputDir);

      const filePaths = {};

      // Save Markdown file
      const mdPath = path.join(outputDir, `${repoName}_tutorial.md`);
      await fs.writeFile(mdPath, tutorialContent.markdown, "utf8");
      filePaths.markdown = mdPath;

      // Save JSON data
      const jsonPath = path.join(outputDir, `${repoName}_data.json`);
      await fs.writeFile(
        jsonPath,
        JSON.stringify(tutorialContent.data, null, 2),
        "utf8"
      );
      filePaths.json = jsonPath;

      return filePaths;
    } catch (error) {
      throw new Error(`Failed to save tutorial files: ${error.message}`);
    }
  }

  _prepareTutorialData(analysisResults, repoInfo, fileStructure) {
    const overview = analysisResults.overview || {};
    const relationships = analysisResults.relationships || {};
    const components = analysisResults.components || {};
    const setup = analysisResults.setup || {};

    return {
      repository: {
        name: repoInfo.name || "Unknown",
        owner: repoInfo.owner || "Unknown",
        url: `https://github.com/${repoInfo.owner || ""}/${
          repoInfo.name || ""
        }`,
        generated_at: new Date().toISOString(),
      },
      overview: {
        purpose: overview.purpose || "Purpose not analyzed",
        technology_stack: overview.technology_stack || [],
        architecture_type: overview.architecture_type || "Unknown",
        target_audience: overview.target_audience || "Unknown",
        complexity_level: overview.complexity_level || "Unknown",
        complexity_reasoning: overview.complexity_reasoning || "",
        flows: overview.flows || {},
        apk_name: overview.apk_name || "Unknown",
        android_package: overview.android_package || "Unknown",
      },
      structure: {
        total_files: fileStructure.total_files || 0,
        languages: fileStructure.languages || {},
        entry_points: relationships.entry_points || [],
        key_components: relationships.key_components || [],
      },
      components: components.components || [],
      data_flow: relationships.data_flow || "Data flow not analyzed",
      dependencies: relationships.dependencies || {},
      setup: {
        prerequisites: setup.prerequisites || [],
        running_instructions: setup.running_instructions || [],
        flows: setup.flows || [],
      },
      file_structure_visual: this._generateFileStructureVisual(fileStructure),
    };
  }

  _generateMarkdownTutorial(tutorialData) {
    const template = `
# 📚 {{repository.name}} Tutorial

**Repository:** [{{repository.owner}}/{{repository.name}}]({{repository.url}})  
**Generated:** {{repository.generated_at}}

## 🔍 Project Overview

### Purpose
{{overview.purpose}}

### Technology Stack
{{#each overview.technology_stack}}
- {{this}}
{{/each}}

### Client Flows
{{#each overview.flows}}
- **{{@key}}**
  - Description: {{this.description}}
  - Steps:
    {{#each this.steps}}
      - {{this}}
    {{/each}}
{{/each}}

### Architecture & Complexity
- **Type:** {{overview.architecture_type}}
- **Complexity:** {{overview.complexity_level}}
- **Reasoning:** {{overview.complexity_reasoning}}

### Target Audience
{{overview.target_audience}}

## 🧱 Project Structure

### Statistics
- **Total Files:** {{structure.total_files}}
- **Languages:** {{#each structure.languages}}{{@key}} ({{this}}){{#unless @last}}, {{/unless}}{{/each}}

### Entry Points
{{#each structure.entry_points}}
- {{file}}: {{description}}
{{/each}}

### File Structure
\`\`\`
{{file_structure_visual}}
\`\`\`

## 🧠 Key Components

{{#each components}}
### {{name}} ({{type}})

**File:** \`{{file}}\`

**What:** {{what}}

**Why:** {{why}}

**How:** {{how}}

{{#if inputs}}**Inputs:** {{inputs}}{{/if}}

{{#if outputs}}**Outputs:** {{outputs}}{{/if}}

---

{{/each}}

## 🔁 Data Flow

{{#each data_flow}}
- **{{flow}}**
  {{#each steps}}
    - {{this}}
  {{/each}}
{{/each}}

## ⚙️ Setup & Running

### Prerequisites
{{#each setup.prerequisites}}
- {{this}}
{{/each}}

### Running Instructions
{{#each setup.running_instructions}}
- {{this}}
{{/each}}

{{#if setup.flows}}
### Setup Flows
{{#each setup.flows}}
- **{{@key}}**
  {{#each this.steps}}
    - {{this}}
  {{/each}}
{{/each}}
{{/if}}
---

        `;

    const compiledTemplate = handlebars.compile(template.trim());
    return compiledTemplate(tutorialData);
  }

  _generateFileStructureVisual(fileStructure) {
    if (!fileStructure.files) {
      return "No file structure available";
    }

    // Group files by directory
    const dirs = {};
    for (const fileInfo of fileStructure.files) {
      const dirName = fileInfo.directory || "";
      if (!dirs[dirName]) {
        dirs[dirName] = [];
      }
      dirs[dirName].push(fileInfo.name);
    }

    // Build tree structure
    const lines = [];
    const sortedDirs = Object.keys(dirs).sort();

    for (const dirName of sortedDirs) {
      const files = dirs[dirName];

      if (dirName === "") {
        // Root files
        for (const file of files.sort().slice(0, 10)) {
          lines.push(`├── ${file}`);
        }
        if (files.length > 10) {
          lines.push(`├── ... and ${files.length - 10} more files`);
        }
      } else {
        lines.push(`├── ${dirName}/`);
        for (const file of files.sort().slice(0, 5)) {
          lines.push(`│   ├── ${file}`);
        }
        if (files.length > 5) {
          lines.push(`│   └── ... and ${files.length - 5} more files`);
        }
      }
    }

    return lines.slice(0, 50).join("\n"); // Limit total lines
  }

  setupHelpers() {
    // Register Handlebars helpers
    handlebars.registerHelper("unless", function (conditional, options) {
      if (!conditional) {
        return options.fn(this);
      }
      return options.inverse(this);
    });
  }
}

module.exports = { TutorialGenerator };
