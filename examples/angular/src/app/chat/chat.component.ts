import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Chat } from '@ai-sdk/angular';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css',
})
export class ChatComponent {
  private fb = inject(FormBuilder);
  public chat: Chat = new Chat({});

  chatForm: FormGroup;

  constructor() {
    this.chatForm = this.fb.group({
      userInput: ['', Validators.required],
    });
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
          selectedModel: 'gpt-4.1',
        },
      },
    );
  }
}
