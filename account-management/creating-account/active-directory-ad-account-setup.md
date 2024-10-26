---
icon: '2'
---

# Active Directory (AD) Account Setup

#### 2.1 Check for Similar Username

1. Use the following username structure: **First letter of the first name + surname (e.g., john.smith).**
2. If the username is already taken, add the middle initial (e.g., johnh.smith) or use a shortened format like j.smith.
3. Search for similar usernames in **waystone.local** and **dms.local**.

***

#### 2.2 Create User Account via RSAT Tool

1. Log in to **WAYSTONE.LOCAL** via the RSAT tools.
2. Navigate to the correct folder in the AD Tree, and create the user using the format: [**FIRSTNAME.LASTNAME@WAYSTONE.COM**](mailto:FIRSTNAME.LASTNAME@WAYSTONE.COM).
3. Fill in all required fields:
   * First Name
   * Last Name
   * User Logon Name (ensure the domain is waystone.com)
   * Password and confirmation
4. Click Save.

***

#### 2.3 Move User to the Correct Organization Unit (OU)

1. Search for the user in Active Directory.
2. Right-click the user, select Properties, and verify the Object tab to confirm the correct entity.
3. If necessary, move the user to the correct OU as specified in the New Joiner Ticket.
