import fetch from 'node-fetch';
import { git } from './git';
import { OpenAIApi } from 'openai';
import { addCommentToPR } from './pr';
import * as https from 'https';
import * as http from 'http';
import * as tl from "azure-pipelines-task-lib/task";

export async function reviewFile(targetBranch: string, fileName: string, agent: http.Agent | https.Agent, apiKey: string, openai: OpenAIApi | undefined, aoiEndpoint: string | undefined, language: string, model: string) {
  console.log(`Start reviewing ${fileName} ...`);

  const defaultOpenAIModel = model;
  const patch = await git.diff([targetBranch, '--', fileName]);

  const instructions = language === 'PT-BR' ? `Atue como um revisor de código de um Pull Request, fornecendo feedback sobre possíveis bugs e questões de código limpo.
        Você recebe as alterações do Pull Request em formato de patch.
        Cada entrada de patch tem a mensagem de commit na linha de Assunto seguida pelas alterações de código (diffs) em formato unidiff.
        Como revisor de código, sua tarefa é:
                - Revisar apenas linhas adicionadas, editadas ou excluídas.
                - Se não houver bugs e as alterações estiverem corretas, escreva apenas 'Sem feedback.'
                - Se houver bug ou alterações de código incorretas, não escreva 'Sem feedback.'` :
        `Act as a code reviewer of a Pull Request, providing feedback on possible bugs and clean code issues.
        You are provided with the Pull Request changes in a patch format.
        Each patch entry has the commit message in the Subject line followed by the code changes (diffs) in a unidiff format.
        As a code reviewer, your task is:
                - Review only added, edited or deleted lines.
                - If there's no bugs and the changes are correct, write only 'No feedback.'
                - If there's bug or incorrect code changes, don't write 'No feedback.'`;

  try {
    let choices: any;

    if (openai) {
      const response = await openai.createChatCompletion({
        model: tl.getInput('model') || defaultOpenAIModel,
        messages: [
          {
            role: "system",
            content: instructions
          },
          {
            role: "user",
            content: patch
          }
        ],
        max_tokens: 500
      });

      choices = response.data.choices
    }
    else if (aoiEndpoint) {
      const request = await fetch(aoiEndpoint, {
        method: 'POST',
        headers: { 'api-key': `${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `${instructions}\n, patch : ${patch}}`
          }]
        })
      });

      const response = await request.json();

      choices = response.choices;
    }

    if (choices && choices.length > 0) {
      const review = choices[0].message?.content as string;

      if (review.trim() !== "No feedback.") {
        await addCommentToPR(fileName, review, agent);
      }
    }

    console.log(`Review of ${fileName} completed.`);
  }
  catch (error: any) {
    if (error.response) {
      console.log(error.response.status);
      console.log(error.response.data);
    } else {
      console.log(error.message);
    }
  }
}