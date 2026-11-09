This is an overview of data stored in data.db, organized by table and columns

configs
- name: config name, stored as text
- components: a JSON of the list of components, stored as text

users
- name: username, stored as TEXT object
- hash: the hash of the password, stored as binary
- salt: the salt to add to the password before checking its hash, stored as binary