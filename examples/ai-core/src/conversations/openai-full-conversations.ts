import { openai } from '@ai-sdk/openai';
import 'dotenv/config';

async function main() {
  // create a conversation
  console.log('Creating conversation...');
  const conversation = await openai.conversations.create({
    metadata: { topic: 'ai-sdk-demo' },
    items: [
      {
        type: 'message',
        role: 'user',
        content: 'Hello! How can you help me?',
      },
    ],
  });

  console.log('Created conversation:', conversation);

  // add more items to the conversation
  console.log('\nAdding items to conversation...');
  const items = await openai.conversations.items.create(conversation.id, {
    items: [
      {
        type: 'message',
        role: 'user',
        content: 'Tell me about the AI SDK.',
      },
      {
        type: 'message',
        role: 'user',
        content: 'What providers does it support?',
      },
    ],
  });

  console.log('Added items:', items.data.length);

  // list all conversation items
  console.log('\nListing conversation items...');
  const allItems = await openai.conversations.items.list(conversation.id, {
    limit: 20,
  });

  console.log('Total items:', allItems.data.length);
  console.log('Has more:', allItems.has_more);

  // retrieve the conversation
  console.log('\nRetrieving conversation...');
  const retrieved = await openai.conversations.retrieve(conversation.id);
  console.log('Retrieved conversation metadata:', retrieved.metadata);

  // update conversation metadata
  console.log('\nUpdating conversation metadata...');
  const updated = await openai.conversations.update(conversation.id, {
    metadata: { topic: 'ai-sdk-demo', status: 'active' },
  });

  console.log('Updated metadata:', updated.metadata);

  // retrieve a specific item
  if (allItems.data.length > 0) {
    console.log('\nRetrieving specific item...');
    const item = await openai.conversations.items.retrieve(
      conversation.id,
      allItems.data[0].id!,
    );
    console.log('Retrieved item type:', item.type);
  }

  // delete a conversation item
  if (allItems.data.length > 1) {
    console.log('\nDeleting a conversation item...');
    const updatedConversation = await openai.conversations.items.delete(
      conversation.id,
      allItems.data[1].id!,
    );
    console.log('Item deleted, conversation still exists');
  }

  // list items again to see the change
  console.log('\nListing items after deletion...');
  const finalItems = await openai.conversations.items.list(conversation.id);
  console.log('Remaining items:', finalItems.data.length);

  // finally, delete the entire conversation
  console.log('\nDeleting entire conversation...');
  const deletedConversation = await openai.conversations.delete(
    conversation.id,
  );
  console.log('Deleted conversation:', deletedConversation);

  console.log('\nFull conversation management demo complete!');
}

main().catch(console.error);
