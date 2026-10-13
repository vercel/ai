import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const credentialManagerSource = `
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class AISDKCredentialManager {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct Credential {
    public UInt32 Flags; public UInt32 Type; public string TargetName;
    public string Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize; public IntPtr CredentialBlob;
    public UInt32 Persist; public UInt32 AttributeCount; public IntPtr Attributes;
    public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);
  [DllImport("advapi32.dll", SetLastError = true)] static extern void CredFree(IntPtr credential);
  public static string Read(string target) {
    IntPtr pointer;
    if (!CredRead(target, 1, 0, out pointer)) return null;
    try {
      Credential value = Marshal.PtrToStructure<Credential>(pointer);
      byte[] bytes = new byte[value.CredentialBlobSize];
      Marshal.Copy(value.CredentialBlob, bytes, 0, bytes.Length);
      return Encoding.Unicode.GetString(bytes);
    } finally { CredFree(pointer); }
  }
}`;

export async function readWindowsCredentialManagerPassword({
  targetName,
}: {
  targetName: string;
}): Promise<string | undefined> {
  try {
    const result = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Add-Type -TypeDefinition $env:AI_SDK_WINDOWS_CREDENTIAL_MANAGER_SOURCE; $value = [AISDKCredentialManager]::Read($env:AI_SDK_WINDOWS_CREDENTIAL_MANAGER_TARGET); if ($null -ne $value) { [Console]::Out.Write($value) }`,
      ],
      {
        env: {
          ...process.env,
          AI_SDK_WINDOWS_CREDENTIAL_MANAGER_SOURCE: credentialManagerSource,
          AI_SDK_WINDOWS_CREDENTIAL_MANAGER_TARGET: targetName,
        },
        windowsHide: true,
      },
    );
    return result.stdout || undefined;
  } catch {
    return undefined;
  }
}
