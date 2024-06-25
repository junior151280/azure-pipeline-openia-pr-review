import * as tl from "azure-pipelines-task-lib/task";
import { Configuration, OpenAIApi } from 'openai';
import { deleteExistingComments } from './pr';
import { reviewFile } from './review';
import { getTargetBranchName } from './utils';
import { getChangedFiles } from './git';
import * as https from 'https';
import * as http from 'http';

async function run() {
  try {
    if (tl.getVariable('Build.Reason') !== 'PullRequest') {
      tl.setResult(tl.TaskResult.Skipped, "This task should be run only when the build is triggered from a Pull Request.");
      return;
    }

    let openai: OpenAIApi | undefined;
    const supportSelfSignedCertificate = tl.getBoolInput('support_self_signed_certificate');
    const apiKey = tl.getInput('api_key', true);
    const aoiEndpoint = tl.getInput('aoi_endpoint');
    const useHttps = tl.getBoolInput('use_https', true);
    const reviewLanguage = tl.getInput('review_language', true) || 'PT-BR';
    const openaiModel = tl.getInput('model') || 'GTP-3.5-turbo';

    if (apiKey == undefined) {
      tl.setResult(tl.TaskResult.Failed, 'No Api Key provided!');
      return;
    }

    if (aoiEndpoint == undefined) {
      const openAiConfiguration = new Configuration({
        apiKey: apiKey,
      });

      openai = new OpenAIApi(openAiConfiguration);
    }

    const agentOptions = {
      rejectUnauthorized: !supportSelfSignedCertificate
    };

    let agent: http.Agent | https.Agent;

    if (useHttps) {
      agent = new https.Agent(agentOptions);
    } else {
      agent = new http.Agent();
    }

    let targetBranch = getTargetBranchName();

    if (!targetBranch) {
      tl.setResult(tl.TaskResult.Failed, 'No target branch found!');
      return;
    }

    const filesNames = await getChangedFiles(targetBranch);

    await deleteExistingComments(agent);

    for (const fileName of filesNames) {
      await reviewFile(targetBranch, fileName, agent, apiKey, openai, aoiEndpoint, reviewLanguage, openaiModel)
    }

    tl.setResult(tl.TaskResult.Succeeded, "Pull Request reviewed.");
  }
  catch (err: any) {
    tl.setResult(tl.TaskResult.Failed, err.message);
  }
}

run();