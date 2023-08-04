import { z } from 'zod'

import type { OpenAIStreamCallbacks } from '../streams'
import type { JSONValue, Message } from '../shared/types'

const FunctionParameters = z.object({
  type: z.enum(['object', 'array', 'string', 'number', 'boolean']),
  required: z.array(z.string()).optional(),
  properties: z.record(z.any()).optional()
})

const FunctionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  parameters: FunctionParameters.optional()
})

type FunctionSchema = z.infer<typeof FunctionSchema>

type ExperimentalOnFunctionCall = NonNullable<
  OpenAIStreamCallbacks['experimental_onFunctionCall']
>

type CreateFunctionCallMessages = Parameters<ExperimentalOnFunctionCall>[1]

type FunctionResponse = ReturnType<ExperimentalOnFunctionCall>

/**
 * A server-side function handler is a wrapper around an OpenAI function schema and it's corresponding handler.
 * The handler is optional. If it is not provided, the function will be sent to the client.
 * @experimental This API is experimental and may change at any time.
 */
export class experimental_ChatFunction {
  name: string
  private description?: string
  private parameters: FunctionSchema['parameters']
  /**
   * If the handler is undefined, the function will be sent to the client.
   */
  private handler?: (
    args: any,
    createFunctionCallMessages: CreateFunctionCallMessages
  ) => FunctionResponse

  constructor({
    function: functionSchema,
    handler
  }: {
    function: FunctionSchema
    handler?: (
      args: any,
      createFunctionCallMessages: CreateFunctionCallMessages
    ) => FunctionResponse
  }) {
    const parsedSchema = FunctionSchema.safeParse(functionSchema)

    if (!parsedSchema.success) {
      console.trace('Function schema is invalid', parsedSchema.error)
      throw new Error('Function schema is invalid')
    }

    this.name = parsedSchema.data.name
    this.description = parsedSchema.data.description
    this.parameters = parsedSchema.data.parameters
    this.handler = handler
  }

  private validate(args: any): any {
    if (!this.parameters) return args

    for (const key of Object.keys(this.parameters.properties || {})) {
      if (!(key in args)) {
        throw new Error(`Missing required parameter: ${key}`)
      }
    }

    return args
  }

  /**
   * Execute the function handler with the given arguments.
   * The first argument is passed to the function handler.
   * The second should be the function callback from `experimental_onFunctionCall`.
   */
  execute(
    /**
     * Arguments passed to the function handler.
     */
    args: any,
    /**
     * This should be the function from the `experimental_onFunctionCall` callback.
     */
    createFunctionCallMessages: CreateFunctionCallMessages
  ): Promise<any> {
    if (!this.handler) return Promise.resolve(undefined)
    const validatedArgs = this.validate(args)
    return this.handler(validatedArgs, createFunctionCallMessages)
  }

  get schema(): FunctionSchema {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters
    }
  }
}

type FunctionInput =
  | experimental_ChatFunction
  | { function: FunctionSchema; handler?: FunctionHandlerType }
  | (
      | experimental_ChatFunction
      | { function: FunctionSchema; handler?: FunctionHandlerType }
    )[]

type FunctionHandlerType = (
  args: any,
  createFunctionCallMessages: CreateFunctionCallMessages
) => FunctionResponse

type Options = {
  debug?: boolean
}

export class experimental_ChatFunctionHandler extends Array<experimental_ChatFunction> {
  private options: Options = {}

  constructor(functions: FunctionInput, options?: Options) {
    super()

    if (Array.isArray(functions)) {
      for (const func of functions) {
        this.add(func)
      }
    } else {
      this.add(functions)
    }

    if (options) {
      this.options = options
    }
  }

  add(
    func:
      | experimental_ChatFunction
      | { function: FunctionSchema; handler?: FunctionHandlerType }
  ) {
    if (this.options.debug) console.debug('Adding function', func)
    if (func instanceof experimental_ChatFunction) {
      this.push(func)
    } else {
      if (!func?.function) return
      // If it's not an instance of experimental_ChatFunction, we assume it's a FunctionSchema
      // and create a new experimental_ChatFunction from it
      const { function: functionSchema, handler } = func
      this.push(
        new experimental_ChatFunction({
          function: functionSchema,
          handler
        })
      )
    }
  }

  onFunctionCallHandler(messages?: Message[]): ExperimentalOnFunctionCall {
    return async ({ name, arguments: args }, createFunctionCallMessages) => {
      const functionHandler = this.find(f => f.name === name)
      if (!functionHandler) {
        throw new Error(`Function ${name} not found`)
      }

      const createFunctionCallMessagesWithMessages = (
        result: JSONValue,
        messagesFromHandler: Message[] | undefined
      ) => {
        return createFunctionCallMessages(result, [
          ...(messages || []),
          ...(messagesFromHandler || [])
        ])
      }

      if (this.options.debug) console.debug('Executing function', name, args)
      return functionHandler.execute(
        args,
        createFunctionCallMessagesWithMessages
      )
    }
  }

  get schemas(): FunctionSchema[] {
    return this.map(f => f.schema)
  }
}
