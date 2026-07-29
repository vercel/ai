import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  type FormGroup,
} from '@angular/forms';
import { Chat } from '@ai-sdk/angular';
import {
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type DataUIPart,
  type ToolUIPart,
  type UIDataTypes,
  type UIMessagePart,
  type UITools,
} from 'ai';
@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css',
})
export class ChatComponent {
  private fb = inject(FormBuilder);
  public chat: Chat = new Chat({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  chatForm: FormGroup;

  constructor() {
    this.chatForm = this.fb.group({
      userInput: ['', Validators.required],
    });
  }

  isToolPart(
    part: UIMessagePart<UIDataTypes, UITools>,
  ): part is ToolUIPart<UITools> {
    return isToolUIPart(part);
  }

  isDataPart(
    part: UIMessagePart<UIDataTypes, UITools>,
  ): part is DataUIPart<UIDataTypes> {
    return part.type.startsWith('data-');
  }

  sendMessage() {
    if (this.chatForm.invalid) {
      return;
    }

    const userInput = this.chatForm.value.userInput;
    this.chatForm.reset();

    this.chat.sendMessage(
      {
        text: userInput,
      },
      {
        body: {
          selectedModel: 'openai/gpt-4o-mini',
        },
      },
    );
  }

  approveTool(approvalId: string) {
    void this.chat.addToolApprovalResponse({
      id: approvalId,
      approved: true,
    });
  }

  denyTool(approvalId: string) {
    void this.chat.addToolApprovalResponse({
      id: approvalId,
      approved: false,
      reason: 'Denied by the user',
    });
  }
}
